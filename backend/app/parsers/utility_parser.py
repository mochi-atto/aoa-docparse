"""
Utility bill parser using browser OCR text (when needed) + OpenAI for extraction.

Processes each page independently so multi-month and multi-building
documents produce separate records per billing period per building.

Supports both text-based PDFs and scanned image PDFs (via OCR).
"""
import json
from datetime import date
from typing import Optional
import httpx
import pdfplumber
from openai import OpenAI
from app.config import settings

EXTRACTION_PROMPT = """
You are a document parser specializing in utility bills. You will be given text
from one or more pages of a utility bill document.

This content may contain information for MULTIPLE billing periods and/or
MULTIPLE buildings/service addresses. You must identify and extract EACH
unique bill separately.

A unique bill is defined by a unique combination of:
- Service address / building
- Billing period / bill date
- Utility type (when one statement itemizes several services)

Return a JSON object with a single key "bills" containing an array.
Each element in the array should have these exact keys:

{
  "bills": [
    {
      "provider_name": "string — the utility company name",
      "utility_type": "string — exactly one of: electric, water, gas, waste, other (see UTILITY TYPE RULES)",
      "service_address": "string or null — the specific service address / building this bill is for",
      "building_name": "string or null — a short label if the document names the building (e.g., 'Building A', 'Rectory', 'Church')",
      "bill_date": "YYYY-MM-DD — the date the bill was issued",
      "due_date": "YYYY-MM-DD or null",
      "billing_period_start": "YYYY-MM-DD or null",
      "billing_period_end": "YYYY-MM-DD or null",
      "account_number": "string or null",
      "total_amount": "float — the CURRENT CHARGES for THIS billing period, THIS building, and THIS utility type (see AMOUNT RULES)",
      "usage_quantity": "float or null — usage amount (e.g., 1200 for 1200 kWh)",
      "usage_unit": "string or null — e.g., kWh, therms, gallons, CCF",
      "rate": "float or null — cost per unit if available"
    }
  ]
}

CRITICAL RULES:
- If you see data for multiple months, create a SEPARATE entry for each month.
- If you see data for multiple buildings/addresses, create a SEPARATE entry for each building.
- A document with 10 months × 2 buildings should produce 20 entries.
- Do NOT combine or average values across months or buildings.
- If a field is not found, use null.
- For dates, use YYYY-MM-DD format.
- For amounts, use numbers only (no $ signs).
- If the page contains no utility bill data (e.g., it's a cover page, terms, or ad), return {"bills": []}.

AMOUNT RULES (total_amount):
- total_amount must be the charges incurred in THIS billing period only. Look for labels like
  "Current Charges", "Total Current Charges", "New Charges", or "Charges This Period".
- NEVER use "Previous Balance", "Prior Balance", "Balance Forward", "Payments", "Payments Received",
  "Adjustments", or "Credits" as total_amount — these describe past periods.
- "Account Balance", "Amount Due", or "Total Amount Due" may include unpaid past balances or late fees.
  Use them only if no current-charges figure is shown.
- Example: "Previous Balance $281.82 / Payments $281.82 / Current Charges $303.67 /
  Account Balance $303.67" → total_amount = 303.67.

UTILITY TYPE RULES (utility_type):
- "electric": electricity / power service.
- "water": drinking water AND sewer, sewage, wastewater, and stormwater service.
- "gas": natural gas / propane service.
- "waste": solid waste only — trash, garbage, refuse, sanitation, recycling, and dumpster/pickup service.
- Sewer is NOT "waste"; it is "water".
- "other": any other billed service (internet, phone, cable, etc.). Use it only when none of the
  four types above fits.

MULTI-SERVICE STATEMENTS:
- Some statements (e.g., City of Atlanta Department of Watershed Management) itemize several services
  with subtotal lines such as "Total Water Charges", "Total Sewer Charges", "Total Stormwater Charges",
  or "Total Sanitation Charges".
- Group these subtotals by utility_type and create ONE entry per utility_type, whose total_amount is the
  SUM of that type's subtotals. Example: "Total Water Charges $88.10 / Total Sewer Charges $142.55 /
  Total Stormwater Charges $12.00 / Total Sanitation Charges $25.00" → one "water" entry of 242.65 and
  one "waste" entry of 25.00.
- Put usage_quantity/usage_unit on the "water" entry; use null on the others.
- Do NOT also create an entry for the statement's grand total when per-type entries were created.

UTILITY BILL TEXT:
"""


def _extract_all_text(pdf_path: str, extracted_text: Optional[str] = None) -> tuple[list[str], bool]:
    """
    Extract text from all pages. Returns (list_of_page_texts, used_ocr).
    Prefer text extracted in the browser, then use embedded PDF text as a fallback.
    """
    if extracted_text is not None:
        page_texts = extracted_text.split("\n\n--- PAGE BREAK ---\n\n")
        return page_texts, False

    page_texts = []

    # Browser OCR is used for scanned PDFs. Keep text extraction here for API clients
    # that submit a text-based PDF without pre-extracted text.
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            page_texts.append(text if text.strip() else "")

    total_text = "".join(page_texts).strip()
    if len(total_text) > 50:
        print(f"[Parser] Using embedded text extraction ({len(page_texts)} pages)")
        return page_texts, False

    print("[Parser] No embedded text found; browser OCR text was not provided")
    return page_texts, False


def _send_to_llm(text: str) -> list[dict]:
    """Send text to OpenAI and extract bill data. Returns list of bill dicts."""
    if not text.strip():
        return []

    # OpenAI 1.40's default client passes the removed HTTPX `proxies` argument.
    # Supplying the transport explicitly supports the pinned HTTPX 0.28 release.
    with OpenAI(api_key=settings.openai_api_key, http_client=httpx.Client()) as client:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You extract structured data from utility bills. Always respond with valid JSON only.",
                },
                {"role": "user", "content": EXTRACTION_PROMPT + text},
            ],
            temperature=0,
            response_format={"type": "json_object"},
        )

    raw_json = response.choices[0].message.content
    parsed = json.loads(raw_json)

    bills = parsed.get("bills", [])
    if not isinstance(bills, list):
        # If the LLM returned a single object instead of array, wrap it
        bills = [parsed] if "total_amount" in parsed else []

    return bills


def _clean_bill(bill: dict) -> dict:
    """Clean and validate a single extracted bill."""
    # Clean dates
    for date_field in [
        "bill_date", "due_date", "billing_period_start", "billing_period_end",
    ]:
        val = bill.get(date_field)
        if val and isinstance(val, str):
            try:
                bill[date_field] = date.fromisoformat(val)
            except ValueError:
                bill[date_field] = None
        elif not isinstance(val, date):
            bill[date_field] = None

    # Ensure total_amount is a float
    try:
        bill["total_amount"] = float(bill.get("total_amount", 0))
    except (TypeError, ValueError):
        bill["total_amount"] = 0.0

    # Ensure numeric fields
    for field in ["usage_quantity", "rate"]:
        val = bill.get(field)
        if val is not None:
            try:
                bill[field] = float(val)
            except (TypeError, ValueError):
                bill[field] = None

    return bill


def _deduplicate_bills(bills: list[dict]) -> list[dict]:
    """
    Remove duplicate bills that might be extracted from overlapping page chunks.
    Two bills are considered duplicates if they have the same:
    - service_address (or both null)
    - bill_date
    - utility_type
    - total_amount
    """
    seen = set()
    unique = []
    for bill in bills:
        key = (
            bill.get("service_address") or bill.get("building_name") or "",
            str(bill.get("bill_date")),
            bill.get("utility_type") or "",
            bill.get("total_amount", 0),
        )
        if key not in seen:
            seen.add(key)
            unique.append(bill)
    return unique


def parse_utility_bill(pdf_path: str, extracted_text: Optional[str] = None) -> list[dict]:
    """
    Parse a utility bill PDF that may contain multiple billing periods
    and/or multiple buildings.

    Returns a LIST of bill dicts (one per billing period per building).
    """
    page_texts, _used_ocr = _extract_all_text(pdf_path, extracted_text)

    if not any(t.strip() for t in page_texts):
        print("[Parser] WARNING: No text could be extracted from PDF")
        return []

    all_bills = []

    # Strategy: batch pages into chunks and send to LLM
    # This balances accuracy (more context per call) with the need to
    # distinguish separate bills. We send groups of 3 pages at a time
    # which typically covers 1-2 bills worth of content.
    chunk_size = 3
    total_pages = len(page_texts)
    chunks = []

    for i in range(0, total_pages, chunk_size):
        chunk_text = "\n\n--- PAGE BREAK ---\n\n".join(
            page_texts[i : i + chunk_size]
        )
        if chunk_text.strip():
            chunks.append(chunk_text)

    print(f"[Parser] Processing {total_pages} pages in {len(chunks)} chunks")

    for i, chunk in enumerate(chunks):
        print(f"[Parser] Sending chunk {i + 1}/{len(chunks)} to LLM...")
        try:
            bills = _send_to_llm(chunk)
            for bill in bills:
                cleaned = _clean_bill(bill)
                # Only keep bills that have at least a date and amount
                if cleaned.get("bill_date") and cleaned.get("total_amount", 0) > 0:
                    all_bills.append(cleaned)
        except Exception as e:
            print(f"[Parser] Error on chunk {i + 1}: {type(e).__name__}")
            continue

    # Deduplicate in case overlapping pages produced the same bill
    unique_bills = _deduplicate_bills(all_bills)
    print(f"[Parser] Extracted {len(unique_bills)} unique bills from {total_pages} pages")

    return unique_bills
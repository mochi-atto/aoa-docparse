"""
Utility bill parser using OCR (if needed) + OpenAI for extraction.

Processes each page independently so multi-month and multi-building
documents produce separate records per billing period per building.

Supports both text-based PDFs and scanned image PDFs (via OCR).
"""
import json
from datetime import date
from typing import Optional
import pdfplumber
import fitz  # pymupdf
import pytesseract
from PIL import Image
import io
from openai import OpenAI
from app.config import settings

# Update this path if Tesseract is installed elsewhere
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

EXTRACTION_PROMPT = """
You are a document parser specializing in utility bills. You will be given text
from one or more pages of a utility bill document.

This content may contain information for MULTIPLE billing periods and/or
MULTIPLE buildings/service addresses. You must identify and extract EACH
unique bill separately.

A unique bill is defined by a unique combination of:
- Service address / building
- Billing period / bill date

Return a JSON object with a single key "bills" containing an array.
Each element in the array should have these exact keys:

{
  "bills": [
    {
      "provider_name": "string — the utility company name",
      "utility_type": "string — one of: electric, gas, water, sewer, trash, internet, phone, other",
      "service_address": "string or null — the specific service address / building this bill is for",
      "building_name": "string or null — a short label if the document names the building (e.g., 'Building A', 'Rectory', 'Church')",
      "bill_date": "YYYY-MM-DD — the date the bill was issued",
      "due_date": "YYYY-MM-DD or null",
      "billing_period_start": "YYYY-MM-DD or null",
      "billing_period_end": "YYYY-MM-DD or null",
      "account_number": "string or null",
      "total_amount": "float — the total amount due for THIS billing period for THIS building",
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

UTILITY BILL TEXT:
"""


def _extract_text_from_page_pdfplumber(pdf_path: str, page_num: int) -> str:
    """Extract text from a single page using pdfplumber."""
    with pdfplumber.open(pdf_path) as pdf:
        if page_num < len(pdf.pages):
            text = pdf.pages[page_num].extract_text()
            return text if text and text.strip() else ""
    return ""


def _extract_text_from_page_ocr(pdf_path: str, page_num: int) -> str:
    """Extract text from a single page using OCR."""
    doc = fitz.open(pdf_path)
    if page_num < len(doc):
        page = doc[page_num]
        pix = page.get_pixmap(dpi=300)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        text = pytesseract.image_to_string(img)
        doc.close()
        return text if text and text.strip() else ""
    doc.close()
    return ""


def _get_page_count(pdf_path: str) -> int:
    """Get total page count."""
    doc = fitz.open(pdf_path)
    count = len(doc)
    doc.close()
    return count


def _extract_all_text(pdf_path: str) -> tuple[list[str], bool]:
    """
    Extract text from all pages. Returns (list_of_page_texts, used_ocr).
    Tries pdfplumber first, falls back to OCR if text extraction fails.
    """
    page_count = _get_page_count(pdf_path)
    page_texts = []
    used_ocr = False

    # First try pdfplumber for all pages
    for i in range(page_count):
        text = _extract_text_from_page_pdfplumber(pdf_path, i)
        page_texts.append(text)

    # Check if we got meaningful text
    total_text = "".join(page_texts).strip()
    if len(total_text) > 50:
        print(f"[Parser] Using text extraction ({page_count} pages)")
        return page_texts, False

    # Fall back to OCR
    print(f"[Parser] Text extraction failed — falling back to OCR ({page_count} pages)")
    page_texts = []
    used_ocr = True
    for i in range(page_count):
        text = _extract_text_from_page_ocr(pdf_path, i)
        page_texts.append(text)
        if (i + 1) % 5 == 0:
            print(f"[Parser] OCR progress: {i + 1}/{page_count} pages")

    return page_texts, used_ocr


def _send_to_llm(text: str) -> list[dict]:
    """Send text to OpenAI and extract bill data. Returns list of bill dicts."""
    if not text.strip():
        return []

    client = OpenAI(api_key=settings.openai_api_key)
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
    - total_amount
    """
    seen = set()
    unique = []
    for bill in bills:
        key = (
            bill.get("service_address") or bill.get("building_name") or "",
            str(bill.get("bill_date")),
            bill.get("total_amount", 0),
        )
        if key not in seen:
            seen.add(key)
            unique.append(bill)
    return unique


def parse_utility_bill(pdf_path: str) -> list[dict]:
    """
    Parse a utility bill PDF that may contain multiple billing periods
    and/or multiple buildings.

    Returns a LIST of bill dicts (one per billing period per building).
    """
    page_texts, used_ocr = _extract_all_text(pdf_path)

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
            print(f"[Parser] Error on chunk {i + 1}: {e}")
            continue

    # Deduplicate in case overlapping pages produced the same bill
    unique_bills = _deduplicate_bills(all_bills)
    print(f"[Parser] Extracted {len(unique_bills)} unique bills from {total_pages} pages")

    return unique_bills
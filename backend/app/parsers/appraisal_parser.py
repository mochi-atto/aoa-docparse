"""
Insurance appraisal parser — FULLY LOCAL processing.

Uses pdfplumber for PDF text extraction and regex + table extraction
for structured data extraction. NO data is sent to any cloud service.

Tuned for Specialty Property Appraisals LLC format (and similar
insurance appraisal reports with Marshall & Swift worksheets).
"""
import re
from datetime import date, datetime
from typing import Optional
import pdfplumber


def _clean_money(raw: str) -> Optional[float]:
    """Convert a string like '$31,589,100' or '31589100' to a float."""
    if not raw:
        return None
    cleaned = raw.replace("$", "").replace(",", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return None


def _find_money(text: str, patterns: list[str]) -> Optional[float]:
    """Try multiple regex patterns to find a dollar amount."""
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return _clean_money(match.group(1))
    return None


def _find_text(text: str, patterns: list[str]) -> Optional[str]:
    """Try multiple regex patterns to find a text value."""
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return None


def _parse_date(text: str, patterns: list[str]) -> Optional[date]:
    """Try multiple patterns and date formats to extract a date."""
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            date_str = match.group(1).strip()
            # Try various date formats
            for fmt in (
                "%B %d, %Y",      # September 11, 2018
                "%b %d, %Y",      # Sep 11, 2018
                "%m/%d/%Y",       # 09/11/2018
                "%m-%d-%Y",       # 09-11-2018
                "%m/%d/%y",       # 09/11/18
                "%Y-%m-%d",       # 2018-09-11
            ):
                try:
                    return datetime.strptime(date_str, fmt).date()
                except ValueError:
                    continue
    return None


def _extract_building_breakdown(pdf_path: str) -> list[dict]:
    """
    Extract the building-level breakdown table (page 6 style).
    Returns a list of dicts with building name and values.
    """
    buildings = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                if not table or len(table) < 2:
                    continue
                # Look for the summary table by checking headers
                header = table[0]
                if not header:
                    continue
                header_text = " ".join(str(h) for h in header if h).lower()
                if "reproduction" in header_text or "exclusion" in header_text:
                    # This is our summary table
                    for row in table[1:]:
                        if not row or not row[0]:
                            continue
                        name = str(row[0]).strip()
                        if name.upper() == "TOTALS" or not name:
                            continue
                        building = {"name": name}
                        if len(row) > 1 and row[1]:
                            building["cost_of_reproduction_new"] = _clean_money(str(row[1]))
                        if len(row) > 2 and row[2]:
                            building["exclusions"] = _clean_money(str(row[2]))
                        if len(row) > 3 and row[3]:
                            building["cost_less_exclusions"] = _clean_money(str(row[3]))
                        if len(row) > 4 and row[4]:
                            building["flood_value"] = _clean_money(str(row[4]))
                        buildings.append(building)
    return buildings


def parse_appraisal(pdf_path: str) -> dict:
    """
    Parse an insurance appraisal PDF using pdfplumber (local only).
    Returns extracted data as a dictionary.
    """
    # Step 1: Extract all text from PDF
    full_text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                full_text += page_text + "\n"

    # --- Entity / Property Name ---
    entity_name = _find_text(full_text, [
        # "Insurance Appraisal of the <Name>"
        r"Insurance Appraisal\s+of\s+the\s+(.+?)(?:\n|As\s+Of)",
        # "RE: Property Appraisal – <Name>"
        r"RE:\s*Property Appraisal\s*[–\-]\s*(.+?)(?:\n)",
        # "Entity # / Name: <Name>"
        r"Entity\s*#?\s*/?\s*Name:\s*(.+?)(?:\s+Sq\.?\s*Ft\.?|\n)",
    ])

    # --- Appraisal Date ---
    appraisal_date = _parse_date(full_text, [
        r"As\s+Of:\s*(.+?)(?:\n)",
        r"(?:^|\n)\s*((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})",
        r"Date\s+(.+?)(?:\s+Position|\n)",
    ])

    # --- Property Address ---
    # Look for the address block near "Address:" in the building detail pages
    # Stop before "Date", "Framing", or newline to avoid trailing artifacts
    address = _find_text(full_text, [
        r"Address:\s*(.+?)(?:\s+Date|\s+Framing|\n)",
        r"Property Address\s*[:\n]\s*(.+?)(?:\n)",
    ])

    city_state_zip = _find_text(full_text, [
        r"City\s*/\s*State\s*/\s*Zip:\s*(.+?)(?:\s+Framing|\s+County|\n)",
    ])

    full_address = None
    if address and city_state_zip:
        full_address = f"{address}, {city_state_zip}"
    elif address:
        full_address = address

    # --- Total Values (from the summary letter, usually page 4) ---
    cost_of_replacement_new = _find_money(full_text, [
        r"Cost\s+of\s+Replacement\s+New:\s*\$?([\d,]+)",
        r"Cost\s+of\s+Reproduction\s+New:\s*\$?([\d,]+)",
    ])

    total_exclusions = _find_money(full_text, [
        r"Exclusions:\s*\$?\s*([\d,]+)",
    ])

    cost_less_exclusions = _find_money(full_text, [
        r"Cost\s+of\s+Replacement\s+New\s+Less\s+Exclusions:\s*\$?([\d,]+)",
        r"Cost\s+of\s+Reproduction\s+New\s+Less\s+Exclusions:\s*\$?([\d,]+)",
    ])

    flood_value = _find_money(full_text, [
        r"Flood\s+Value:\s*\$?([\d,]+)",
    ])

    # --- Building Details ---
    num_stories = None
    stories_match = re.search(r"#\s*of\s*Stories:\s*(\d+)", full_text)
    if stories_match:
        num_stories = int(stories_match.group(1))

    year_built = None
    year_match = re.search(r"Date\s+Constructed:\s*(\d{4})", full_text)
    if year_match:
        year_built = int(year_match.group(1))

    gross_sq_ft = None
    sqft_match = re.search(r"Gross\s+(?:Floor\s+)?(?:Sq\.?\s*Ft\.?|Area):\s*([\d,]+)", full_text, re.IGNORECASE)
    if sqft_match:
        gross_sq_ft = int(sqft_match.group(1).replace(",", ""))

    construction_type = _find_text(full_text, [
        r"Construction\s+Type:\s*\d+%\s*(.+?)(?:\n|Number)",
        r"Framing:\s*(.+?)(?:\n)",
    ])

    county = _find_text(full_text, [
        r"County:\s*(.+?)(?:\n|ISO)",
    ])

    # --- Building-level Breakdown (from summary table) ---
    building_breakdown = _extract_building_breakdown(pdf_path)

    # --- Appraiser Info ---
    appraiser_firm = _find_text(full_text, [
        r"(SPECIALTY PROPERTY APPRAISALS,?\s*LLC)",
        r"Respectfully submitted:\s*\n\s*(.+?)(?:\n)",
    ])

    appraiser_name = _find_text(full_text, [
        r"(William\s+N\.?\s*Jaeger,?\s*ASA)",
        r"Chief\s+Executive\s+Officer\s*\n\s*(.+?)(?:\n)",
    ])

    return {
        # Core identification
        "entity_name": entity_name,
        "appraisal_date": appraisal_date,
        "property_address": full_address,
        "county": county,

        # Key values
        "cost_of_replacement_new": cost_of_replacement_new,
        "total_exclusions": total_exclusions,
        "cost_less_exclusions": cost_less_exclusions,
        "flood_value": flood_value,

        # Building details
        "year_built": year_built,
        "num_stories": num_stories,
        "gross_sq_ft": gross_sq_ft,
        "construction_type": construction_type,

        # Breakdown by building
        "building_breakdown": building_breakdown,

        # Appraiser
        "appraiser_firm": appraiser_firm,
        "appraiser_name": appraiser_name,
    }
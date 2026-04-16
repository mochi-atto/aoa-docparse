"""
Insurance appraisal parser — FULLY LOCAL processing.

Uses pdfplumber for PDF text extraction and regex + table extraction
for structured data extraction. NO data is sent to any cloud service.

Supports two modes:
1. Template mode: Uses user-defined regex patterns from the Template Builder
2. Fallback mode: Uses hardcoded patterns (tuned for Specialty Property Appraisals LLC)
"""
import re
from datetime import date, datetime
from typing import Optional
import pdfplumber


# --- Utility functions ---

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


def _extract_text_from_pdf(pdf_path: str) -> str:
    """Extract all text from a PDF using pdfplumber."""
    full_text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                full_text += page_text + "\n"
    return full_text


def _extract_building_breakdown(pdf_path: str) -> list[dict]:
    """
    Extract the building-level breakdown table.
    Returns a list of dicts with building name and values.
    """
    buildings = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                if not table or len(table) < 2:
                    continue
                header = table[0]
                if not header:
                    continue
                header_text = " ".join(str(h) for h in header if h).lower()
                if "reproduction" in header_text or "exclusion" in header_text:
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


# --- Template-based extraction ---

# Fields that contain monetary values
MONEY_FIELDS = {
    "cost_of_replacement_new", "total_exclusions", "cost_less_exclusions",
    "flood_value",
}

# Fields that contain dates
DATE_FIELDS = {
    "appraisal_date",
}

# Fields that contain integers
INT_FIELDS = {
    "year_built", "num_stories", "gross_sq_ft",
}


def _apply_template(full_text: str, field_patterns: list[dict]) -> dict:
    """
    Apply user-defined template patterns to extract data.

    Each field_pattern has:
      - field_name: str
      - regex_pattern: str
      - label: str (for display)
    """
    result = {}

    for fp in field_patterns:
        field_name = fp["field_name"]
        pattern = fp["regex_pattern"]

        try:
            match = re.search(pattern, full_text, re.IGNORECASE)
            if not match:
                result[field_name] = None
                continue

            raw_value = match.group(1).strip()

            # Post-process based on field type
            if field_name in MONEY_FIELDS:
                result[field_name] = _clean_money(raw_value)
            elif field_name in DATE_FIELDS:
                # Try to parse as date
                parsed = None
                for fmt in (
                    "%B %d, %Y", "%b %d, %Y", "%m/%d/%Y",
                    "%m-%d-%Y", "%m/%d/%y", "%Y-%m-%d",
                ):
                    try:
                        parsed = datetime.strptime(raw_value, fmt).date()
                        break
                    except ValueError:
                        continue
                result[field_name] = parsed
            elif field_name in INT_FIELDS:
                try:
                    result[field_name] = int(raw_value.replace(",", ""))
                except ValueError:
                    result[field_name] = None
            else:
                result[field_name] = raw_value

        except re.error:
            print(f"[Appraisal Parser] Invalid regex for {field_name}: {pattern}")
            result[field_name] = None

    return result


# --- Hardcoded fallback extraction ---

def _hardcoded_extraction(full_text: str, pdf_path: str) -> dict:
    """
    The original hardcoded regex patterns, used as a fallback when no
    template is available.
    """
    entity_name = _find_text(full_text, [
        r"Insurance Appraisal\s+of\s+the\s+(.+?)(?:\n|As\s+Of)",
        r"RE:\s*Property Appraisal\s*[–\-]\s*(.+?)(?:\n)",
        r"Entity\s*#?\s*/?\s*Name:\s*(.+?)(?:\s+Sq\.?\s*Ft\.?|\n)",
    ])

    appraisal_date = _parse_date(full_text, [
        r"As\s+Of:\s*(.+?)(?:\n)",
        r"(?:^|\n)\s*((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})",
        r"Date\s+(.+?)(?:\s+Position|\n)",
    ])

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

    building_breakdown = _extract_building_breakdown(pdf_path)

    appraiser_firm = _find_text(full_text, [
        r"(SPECIALTY PROPERTY APPRAISALS,?\s*LLC)",
        r"Respectfully submitted:\s*\n\s*(.+?)(?:\n)",
    ])

    appraiser_name = _find_text(full_text, [
        r"(William\s+N\.?\s*Jaeger,?\s*ASA)",
        r"Chief\s+Executive\s+Officer\s*\n\s*(.+?)(?:\n)",
    ])

    return {
        "entity_name": entity_name,
        "appraisal_date": appraisal_date,
        "property_address": full_address,
        "county": county,
        "cost_of_replacement_new": cost_of_replacement_new,
        "total_exclusions": total_exclusions,
        "cost_less_exclusions": cost_less_exclusions,
        "flood_value": flood_value,
        "year_built": year_built,
        "num_stories": num_stories,
        "gross_sq_ft": gross_sq_ft,
        "construction_type": construction_type,
        "building_breakdown": building_breakdown,
        "appraiser_firm": appraiser_firm,
        "appraiser_name": appraiser_name,
    }


# --- Main entry point ---

def _split_into_sections(full_text: str, divider_pattern: str) -> list[str]:
    """Split text into sections based on a divider regex pattern."""
    try:
        regex = re.compile(divider_pattern, re.IGNORECASE)
        matches = list(regex.finditer(full_text))
        if not matches:
            return [full_text]

        sections = []
        for i, match in enumerate(matches):
            start = match.start()
            end = matches[i + 1].start() if i < len(matches) - 1 else len(full_text)
            sections.append(full_text[start:end])
        return sections
    except re.error:
        print(f"[Appraisal Parser] Invalid section divider pattern: {divider_pattern}")
        return [full_text]


def parse_appraisal(pdf_path: str, template: dict = None) -> dict:
    """
    Parse an insurance appraisal PDF using pdfplumber (local only).

    Args:
        pdf_path: Path to the PDF file
        template: Optional template dict with:
                  - 'field_patterns': list of pattern dicts with 'scope' field
                  - 'table_config': optional dict with 'section_divider' pattern
                  If None, falls back to hardcoded patterns.

    Returns:
        Dictionary of extracted data. If sections are detected, includes
        a 'sections' list with per-building data.
    """
    full_text = _extract_text_from_pdf(pdf_path)

    if template and template.get("field_patterns"):
        print(f"[Appraisal Parser] Using template: {template.get('name', 'unnamed')}")

        field_patterns = template["field_patterns"]
        table_config = template.get("table_config") or {}
        section_divider = table_config.get("section_divider", "")

        # Separate document-level and section-level patterns
        doc_patterns = [fp for fp in field_patterns if fp.get("scope") == "document"]
        section_patterns = [fp for fp in field_patterns if fp.get("scope") != "document"]

        # Extract document-level fields from full text
        result = _apply_template(full_text, doc_patterns)

        # Extract section-level fields
        if section_divider and section_patterns:
            sections = _split_into_sections(full_text, section_divider)
            print(f"[Appraisal Parser] Found {len(sections)} sections")

            section_results = []
            for i, section_text in enumerate(sections):
                section_data = _apply_template(section_text, section_patterns)
                section_data["_section_index"] = i + 1
                section_results.append(section_data)

            result["sections"] = section_results
        elif section_patterns:
            # No divider but has section patterns — apply to full text as single section
            section_data = _apply_template(full_text, section_patterns)
            result["sections"] = [section_data]

        # Always try to get building breakdown from tables
        result["building_breakdown"] = _extract_building_breakdown(pdf_path)

        # Fill in any missing top-level fields
        all_fields = [
            "entity_name", "appraisal_date", "property_address", "county",
            "cost_of_replacement_new", "total_exclusions", "cost_less_exclusions",
            "flood_value", "year_built", "num_stories", "gross_sq_ft",
            "construction_type", "appraiser_firm", "appraiser_name",
        ]
        for field in all_fields:
            if field not in result:
                result[field] = None

        return result
    else:
        print("[Appraisal Parser] No template provided — using hardcoded patterns")
        return _hardcoded_extraction(full_text, pdf_path)
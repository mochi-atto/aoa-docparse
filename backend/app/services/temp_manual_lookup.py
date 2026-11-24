"""TEMPORARY manual lookup: a hard-coded catalog of manual *names* keyed by
manufacturer and asset type, ported from the HTML prototype.

It does not search the web and the entries are not real files; attaching one
only records the name on the asset. Replace with a real source (manufacturer
document search, or a curated library) before production, keeping the
find_manuals(asset_type, manufacturer) signature.
"""
TEMPORARY = True

BY_MANUFACTURER = {
    "trane": ["Trane-installation-manual.pdf", "Trane-maintenance-schedule.pdf"],
    "carrier": ["Carrier-installation-manual.pdf", "Carrier-owners-guide.pdf"],
    "lennox": ["Lennox-installation-manual.pdf"],
    "goodman": ["Goodman-installation-manual.pdf"],
    "allen & heath": ["AllenHeath-user-guide.pdf", "AllenHeath-quickstart.pdf"],
    "epson": ["Epson-user-guide.pdf", "Epson-install-guide.pdf"],
    "dell": ["Dell-setup-guide.pdf"],
    "hp": ["HP-setup-guide.pdf"],
    "shaw": ["Shaw-care-and-maintenance.pdf"],
    "sherwin-williams": ["SW-product-data-sheet.pdf"],
}

BY_TYPE = {
    "HVAC unit": ["Filter-change-and-seasonal-service-checklist.pdf"],
    "Roofing": ["Roof-inspection-checklist.pdf"],
    "Parking lot": ["Seal-and-stripe-spec-sheet.pdf"],
    "AV / Sound": ["AV-system-operating-procedures.pdf"],
    "Computer / IT": ["Device-refresh-checklist.pdf"],
    "Flooring / Carpet": ["Flooring-care-guide.pdf"],
    "Paint / Finish": ["Paint-touch-up-guide.pdf"],
    "Windows": ["Window-reseal-instructions.pdf"],
}


def find_manuals(asset_type: str | None, manufacturer: str | None) -> list[str]:
    by_mfr = BY_MANUFACTURER.get((manufacturer or "").strip().lower(), [])
    by_type = BY_TYPE.get(asset_type or "", [])
    return [*by_mfr, *by_type]

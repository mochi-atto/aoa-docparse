# backend/tests/inspect_utility_plumber.py
import pdfplumber

with pdfplumber.open("sample_docs/sample_utility.pdf") as pdf:
    for i, page in enumerate(pdf.pages):
        text = page.extract_text()
        print(f"--- Page {i+1} ---")
        print(f"Length: {len(text) if text else 0}")
        if text:
            print(text[:300])
        if i >= 2:  # just check first 3 pages
            break
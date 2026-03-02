# backend/tests/inspect_appraisal.py
import pdfplumber

with pdfplumber.open("sample_docs/sample_appraisal.pdf") as pdf:
    for i, page in enumerate(pdf.pages):
        print(f"\n{'='*60}")
        print(f"PAGE {i+1}")
        print(f"{'='*60}")
        text = page.extract_text()
        if text:
            print(text)
        else:
            print("[No text extracted - may be a scanned image]")
        
        # Also check for tables
        tables = page.extract_tables()
        if tables:
            print(f"\n--- TABLES ON PAGE {i+1} ---")
            for j, table in enumerate(tables):
                print(f"\nTable {j+1}:")
                for row in table:
                    print(row)
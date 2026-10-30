"""Browser OCR handoff tests; native Tesseract is no longer required."""
import unittest
from unittest.mock import patch

from app.parsers.utility_parser import _extract_all_text, parse_utility_bill


class BrowserTextTests(unittest.TestCase):
    def test_browser_pages_bypass_backend_pdf_extraction(self):
        with patch("app.parsers.utility_parser.pdfplumber.open", side_effect=AssertionError("PDF must not open")):
            pages, used_ocr = _extract_all_text("unused.pdf", "first\n\n--- PAGE BREAK ---\n\nsecond")
        self.assertEqual(pages, ["first", "second"])
        self.assertFalse(used_ocr)

    def test_empty_browser_text_never_calls_ai(self):
        with patch("app.parsers.utility_parser._send_to_llm") as extract:
            self.assertEqual(parse_utility_bill("unused.pdf", extracted_text="  "), [])
        extract.assert_not_called()

    def test_browser_text_batches_pages_and_deduplicates_bills(self):
        text = "\n\n--- PAGE BREAK ---\n\n".join(["one", "two", "three", "four"])
        with patch("app.parsers.utility_parser._send_to_llm", side_effect=lambda _: [{
            "service_address": "Synthetic Hall", "bill_date": "2026-01-01", "total_amount": "10",
        }]) as extract:
            bills = parse_utility_bill("unused.pdf", extracted_text=text)
        self.assertEqual(extract.call_count, 2)
        self.assertEqual(len(bills), 1)
        self.assertEqual(bills[0]["total_amount"], 10)


if __name__ == "__main__":
    unittest.main()

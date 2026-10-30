"""Offline parser regressions with synthetic PDFs and a mocked AI boundary."""
import json
import tempfile
import unittest
from datetime import date
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import fitz
import httpx

from app.parsers.appraisal_parser import parse_appraisal
from app.parsers.utility_parser import parse_utility_bill, _send_to_llm, settings
from app.routers.upload import _serialize_for_json


class ParserTests(unittest.TestCase):
    def test_pinned_openai_and_httpx_work_with_mock_transport(self):
        requests = []

        def respond(request):
            requests.append(request)
            return httpx.Response(200, json={
                "id": "synthetic", "object": "chat.completion", "created": 0,
                "model": "gpt-4o-mini", "choices": [{"index": 0,
                    "message": {"role": "assistant", "content": '{"bills": [{"total_amount": 42.5}]}'},
                    "finish_reason": "stop"}],
            })

        transport = httpx.Client(transport=httpx.MockTransport(respond))
        with patch("app.parsers.utility_parser.httpx", SimpleNamespace(Client=lambda: transport)), patch.object(settings, "openai_api_key", "synthetic-offline-test"):
            self.assertEqual(_send_to_llm("Synthetic utility bill"), [{"total_amount": 42.5}])
        self.assertEqual(len(requests), 1)
        self.assertEqual(json.loads(requests[0].content)["model"], "gpt-4o-mini")
        self.assertTrue(transport.is_closed)

    def test_appraisal_pdf_extracts_and_serializes_section_dates_locally(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic.pdf"
            with fitz.open() as document:
                document.new_page().insert_text((72, 72), "Value: $12,345\nDate: 2026-01-01")
                document.save(path)
            template = {"field_patterns": [
                {"field_name": "cost_of_replacement_new", "regex_pattern": r"Value: (\$[\d,]+)", "scope": "document"},
                {"field_name": "appraisal_date", "regex_pattern": r"Date: ([\d-]+)", "scope": "section"},
            ]}
            with patch("app.parsers.utility_parser.OpenAI", side_effect=AssertionError("AI must not run")):
                result = parse_appraisal(str(path), template)
            self.assertEqual(result["cost_of_replacement_new"], 12345)
            serialized = _serialize_for_json(result)
            json.dumps(serialized)
            self.assertEqual(serialized["sections"][0]["appraisal_date"], "2026-01-01")
            self.assertEqual(result["sections"][0]["appraisal_date"], date(2026, 1, 1))

    def test_utility_pdf_embedded_text_without_live_ai(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic.pdf"
            with fitz.open() as document:
                document.new_page().insert_text((72, 72), "Synthetic utility bill. Test Electric. Total 42.50. Date 2026-01-01")
                document.save(path)
            with patch("app.parsers.utility_parser._send_to_llm", return_value=[{
                "bill_date": "2026-01-01", "total_amount": "42.50",
            }]) as extract:
                bills = parse_utility_bill(str(path))
            self.assertIn("Synthetic utility bill", extract.call_args.args[0])
            self.assertEqual(bills[0]["total_amount"], 42.5)
            self.assertEqual(bills[0]["bill_date"], date(2026, 1, 1))


if __name__ == "__main__":
    unittest.main()

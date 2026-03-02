# backend/tests/test_parsers.py
from app.parsers.appraisal_parser import parse_appraisal
from app.parsers.utility_parser import parse_utility_bill

# Test appraisal (local only)
result = parse_appraisal("sample_docs/sample_appraisal.pdf")
print("Appraisal result:", result)

# Test utility (requires OPENAI_API_KEY)
result = parse_utility_bill("sample_docs/sample_utility.pdf")
print("Utility result:", result)
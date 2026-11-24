# Utility upload reliability — AOA-25 / AOA-26

## Established locally

Base: main d692593, including AOA-39 Excel export and OpenAI 1.55.3.
No repository AGENTS.md was present. Original checkout was clean and left untouched;
work is in an isolated worktree. No existing PR covered these tickets.

The async upload route called synchronous PDF/LLM parsing and SQLAlchemy on the
event loop. A repeatable four-request ASGI experiment with a controlled 200 ms
parser wait measured 0.869 s batch / 0.856 s event-loop probe before, and
0.250 s / 0.011 s after moving the synchronous handler to FastAPI's bounded
worker pool. This measures request handling, **not real OpenAI throughput**.
Individual documents retain sequential three-page parser chunks; no unbounded
per-page API fan-out or new job infrastructure is introduced. Auth transactions
are released before parsing. Worker count, provider quotas and hosting can still
limit throughput.

Observed visibility defects:
- The form ignored `success: false` on HTTP 200 and claimed extraction succeeded.
- Zero/credit-only building cards were hidden by a positive-charge chart condition.
- Server list filters ran before account-to-building and type normalization,
  excluding bills visible in the unfiltered list.
- Parser chunk exceptions were swallowed, allowing incomplete documents to look successful.

The form now checks extraction success, opens Utility after success, keeps failed
files for retry, and relies on the server's audit event. Removing the fake timer
also removes a timer leak on failed requests. Existing inline correction and
manual appraisal entry remain available. Main did not contain a manual utility
creation endpoint or form; a utility entry fallback is delivered with the
consumption UI follow-up.

## Retry and migration contract

An optional client-generated `upload_key` (retained for a staged File) scopes a
receipt to a parish. New table `utility_uploads` has a unique `(parish_id,
upload_key)` constraint and SHA-256 of PDF plus submitted text. The receipt,
bills and audit commit together. Concurrent winners replay the same response;
key reuse for different input is HTTP 409. Failed parsing writes nothing and
leaves the key available. Callers without a key keep existing behavior. Re-selecting
a file creates a new submission; this is request idempotency, not cross-document
deduplication. Receipts do not store PDF bytes. Existing bill rows are untouched.

Review `python -m app.migrations`; apply explicitly with `--apply` before serving
this version. No shared/production migration was performed.

## Local verification commands

From backend, `DATABASE_URL=sqlite://` and `AOA_ENV_FILE=/dev/null`:

```
venv/bin/python -m pip check
venv/bin/python -m pytest tests -q
venv/bin/python -m unittest discover -s tests -q
PYTHONPATH=. venv/bin/python tests/benchmark_uploads.py
```

From frontend: `npm ci`, `npm test`, `npm run lint`, `npm run build`.
Synthetic fixtures are generated using PyMuPDF; no identifiable bills are used.
Tests cover resolved building/type filters, reload reads, failure/empty extraction,
partial parser failure, sequential and simultaneous retries, and parish roles.
The existing migration suite checks clean creation and additive upgrade/repeat.
Export tests exercise the recently merged workbook implementation unchanged.

## Hosted acceptance — pending team deployment and authorized tenant

1. Apply the reviewed migration to the approved test database; verify `/api/ready`.
2. Sign in as a test parish Admin; create Hall and Rectory with distinct account
   numbers. Use synthetic PDFs with those accounts and known period/amount/usage.
3. In two independent signed-in browser sessions, submit four bills at once.
   Capture request start/end, parser/API timing (without bill contents), HTTP
   responses and provider throttling; compare the same batch before/after on the
   same infrastructure. Confirm other authenticated reads remain responsive.
4. Upload using Add Files → Parse & Upload. Confirm successful records in Utility,
   correct building/account, then hard reload. Check zero/credit bills as well.
5. Simulate a failed extraction and a failed network response. Confirm a visible
   error, staged file remains, retry with the same key creates exactly one set
   of bill records and one server upload audit. Verify a four-page document with
   a later chunk failure creates no partial bill set.
6. As Viewer/Editor confirm bills are readable but upload/edit/delete are denied;
   as a nonmember confirm the parish and bills are inaccessible.

No production API keys or hosted tenant credentials were used. No conclusion
about the original tunnel/infrastructure failure is claimed.

Executed on this worktree: pip check passed; pytest with disposable PostgreSQL
16 passed 81 tests (no skips); offline pytest passed 73, skipped 6 PostgreSQL
checks; frontend 4 tests, lint and production build passed. Existing Pydantic
deprecations and Vite bundle-size warning remain.

Follow-up: simultaneous same-key retries also verified against PostgreSQL 16;
per-file extraction errors are rendered beside the staged file for actionable retry.

Missing/invalid charges remain missing rather than becoming a synthetic zero-dollar bill.

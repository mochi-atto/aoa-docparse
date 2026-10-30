# Unified integration verification on Apple Silicon

Executed on this Mac from integration/unified-aoa-app after merging current main
fceb4b2 with the unified/work-order histories. Earlier Windows results are
historical references and are superseded by this run.

## Environment

- macOS arm64; Node 26.13.0/npm 11.20.0; Homebrew Python 3.11.18 in backend/venv.
- Docker Desktop; native arm64 PostgreSQL 16 image.
- Pinned backend requirements installed; pip check: no broken requirements.
- Frontend installed from package-lock.json; npm audit: 0 vulnerabilities.
- No real Auth0/OpenAI/SMTP credentials supplied or committed.

## Executed checks

| Command/check | Actual result |
| --- | --- |
| DATABASE_URL=sqlite:// TEST_POSTGRES_URL=<disposable localhost:55432 URL> venv/bin/python -m pytest tests -q | 62 passed, 0 failed, 0 skipped; 9 deprecation warnings |
| Same environment, venv/bin/python -m unittest discover -s tests -q | 52 passed, 0 failed, 0 skipped (unittest subset, not additional independent coverage) |
| npm test | 2 passed, 0 failed |
| npm run typecheck | Pass |
| npm run lint | Pass, no errors/warnings |
| npm run build | Pass; Vite bundle-size and Node deprecation warnings remain |
| npm audit --audit-level=low | 0 vulnerabilities |
| Python pip check | No broken requirements |
| Frontend localhost:5174 | HTTP 200 |
| API health and readiness through frontend proxy | HTTP 200, healthy/ready |
| API localhost:8001/openapi.json | HTTP 200 |
| Unauthenticated parish API | HTTP 403 |
| CORS preflight for localhost:5174 | HTTP 200, exact allowed origin |
| Migration plan/apply on new aoa_unified_validation | 13 tables created; no existing database changed |
| git diff --check | Pass |

The suite includes four concurrent PostgreSQL race tests, a PostgreSQL legacy
migration regression, and a complete PostgreSQL application test using real
synthetic RSA-signed JWTs. The latter mocks JWKS discovery only: real token
validation, account bootstrap, invitations/verified identities, Editor/Viewer
restrictions, appraisal create/edit/delete, generated PDF parsing, asset CRUD,
private document upload/download/delete and claim/start/hold/resume/submit/Admin
close all execute against unique synthetic schemas. SQLite regressions cover
cross-parish isolation, last-admin protection, parser transport and nested dates,
file signatures/size/path validation, invitation expiry/replay and role changes.
Frontend tests cover token renewal, removal of stale defaults and failed renewal.

Commands from the repository root (each server runs in its own terminal):

```bash
cd backend
DATABASE_URL=sqlite:// TEST_POSTGRES_URL='<disposable localhost:55432 URL>' venv/bin/python -m pytest tests -q
DATABASE_URL=sqlite:// TEST_POSTGRES_URL='<disposable localhost:55432 URL>' venv/bin/python -m unittest discover -s tests -q
```

```bash
cd frontend
npm test
npm run typecheck
npm run lint
npm run build
npm audit
```

Tests refuse PostgreSQL hosts/ports outside localhost:55432, create unique schemas,
and use synthetic documents/identities. No invitation email or live AI request is
sent. The test container stores its PostgreSQL cluster in tmpfs; do not point the
running validation API at a shared database. Existing development parish_db and
its volume were not migrated, reset or populated by this integration.

## Not verified

Live Auth0 sign-in/callback and signed-in browser UI (including real Editor/Viewer
accounts), real OpenAI extraction, SMTP delivery, OCR accuracy and full browser
PDF workflows. The HTTP frontend check verifies serving/proxy behavior, not a
visual browser test. Credentials and Auth0 callback/origin registration are still
needed. Existing temporary asset disk storage/sample manual names are preserved;
production acceptance and durable storage remain pending. CI results are reported
on the integration PR and are separate from these local results.

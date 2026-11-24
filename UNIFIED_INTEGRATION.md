# Unified AoA application integration

## Repository evidence

Integration branch: integration/unified-aoa-app, based on origin/main fceb4b2.
Fetched all remotes with prune before changes. No preexisting uncommitted work
was present. Existing branches and contributor commits remain intact.

| Feature | Verified branch/history | Result |
| --- | --- | --- |
| PDF DocParse, utility normalization, local appraisals, split dashboard, profiles and task links | main df0c011, retained in main fceb4b2 | Preserved |
| Eric's register, accrual/remaining-life calculations, planning, documents and sample manual catalog | eric-assets 3465987 / 9d0832a; PR #4 merged into main fceb4b2 | Original architecture/history retained; parish authorization added by unified source |
| Role foundation, parish selection, invitations and members | rayeed-role-management c9456fd by Rayeed Zaman; role-selection; hardened 5d34d41 via PR #2 → 4a253b4 | Existing port retained; account router, invitation page and member modal compared byte-for-byte with hardened source |
| Claim/start/hold/resume | work-order-lifecycle f86d39e by c-mfy; PR #1 → work-orders 0f7aa0d | Merged with history |
| Submit/admin close, assignee checks, parish isolation, locked claims/numbering, secured assets and templates | codex/unified-parish-management 6cd73bd; PR #3 → work-order-lifecycle 50a3d10 | Merged with history |
| Session renewal, JWT required claims/key rotation, upload field retention/audits, migration ordering and missing hold column | integration/unified-aoa-app | Implemented here with regressions |

All PRs #1–#4 were merged, but only #4 targeted main. PR #2 targeted role-selection,
#3 targeted work-order-lifecycle, and #1 targeted work-orders. This integration
merges origin/work-order-lifecycle and origin/work-orders onto current main.
Eric's work is already an ancestor through #4. Role-selection has no common
ancestor with main; wholesale merging would replace the shared application's
history/UI with an obsolete monolithic dashboard. Its hardened functionality was
already ported in the unified source, with attribution to c9456fd; no unrelated
history merge or duplicate role implementation is added.

## Architecture and changes

One React routing tree and Auth0 provider serve parish selection, dashboard,
appraisal entry, account settings and invitations. A shared Axios /api client
requests current Auth0 SDK tokens. One FastAPI application registers parish,
member, data, upload, template, work-order, profile and asset routers. PostgreSQL
uses shared Account/ParishMember and parish-scoped models. The backend enforces
all permissions independently of UI controls.

The main-relative diff promotes the existing secured integration across backend
models/routers, frontend dashboard tabs, AssetsTab, member/invitation UI and
parser tests. Additional changes in this branch:

- backend/app/auth.py: require JWT subject/expiration, handle missing Auth0 config,
  refresh JWKS for rotated keys; real RSA signature tests.
- backend/app/migrations.py: add missing hold-state column; create foreign-key
  targets before altering legacy tables; SQLite/PostgreSQL preservation tests.
- backend/app/routers/upload.py: retain extracted building/address fields and
  atomically add actor audit events for both PDF processing paths.
- backend/app/routers/parishes.py: handle unique-name conflicts during flush and
  immediately report effective roles after creation/read.
- frontend/src/components/AuthenticatedApp.tsx, main.tsx and services/api.ts:
  current-token request interceptor, explicit profile/email scopes, auth error UI.
- ParishSelectPage and DashboardPage: display load errors; do not silently turn
  failed Work Orders/templates/profile requests into empty modules.
- frontend/tests/api.test.mjs: session renewal and failed-renewal regressions;
  package scripts expose test and typecheck commands.
- .github/workflows/validate.yml: Python 3.11/PostgreSQL 16 and Node 22 PR checks.
- Environment templates/docs and .gitignore: current local configuration and
  secret exclusions. Empty root npm lockfile removed; frontend retains its lock.

No business feature was removed. Legacy viewer endpoint aliases, existing
financial calculations/categories, local appraisal parsing and Eric's temporary
catalog/storage remain compatible. No production credential or authentication
bypass was introduced.

## Database and validation

See [setup and migration review](INTEGRATION_REVIEW.md) and
[executed results](LOCAL_VERIFICATION.md). All migration writes and signed-session
integration checks ran against disposable PostgreSQL on localhost:55432 and unique
synthetic schemas. Existing parish_db was only queried for its parish count (0);
no migration or data change was applied to it in this integration task.

The local validation frontend runs on 5174 with AOA_API_TARGET=http://localhost:8001;
the API on 8001 connects to aoa_unified_validation inside the disposable container.
The earlier development pair on 5173/8000 and its database remain available.

## Merge and acceptance

Push only the integration branch and request a PR into main. Do not directly
merge main, close contributor PRs, force-push, or bypass protections. Review CI,
required reviews and the full main-relative diff before merging. Live Auth0 sign-in,
Editor/Viewer browser sessions, OpenAI, SMTP and OCR acceptance remain dependent
on user credentials; durable asset storage/manual-source decisions remain required
for production. These are disclosed limits, not passing checks.

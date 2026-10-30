# Unified parish application: review and demo

## Histories and attribution

The original `rayeed-role-management` worktree and its uncommitted files remain
intact. Its complete Account/ParishMember, Auth0 identity, invitations, parish
ownership, scoped data/task APIs, and member/selection/invitation UI foundation
were manually ported. The unrelated histories were never forced together.

This branch starts on `main` at df0c011, preserves Eric's Assets commits through
a related-history merge of `eric-assets` at 9d0832a, and includes the existing
work-order-lifecycle commits through a related-history merge at f86d39e. Main's
split dashboard, saved user profiles, work-order/task links, and current-charge,
water/sewer and multi-service parser fixes are preserved. Eric's register,
replacement planning, heuristics, catalog and document holder remain his design.

## Permission policy for team review

| Operation | Admin | Editor / Technician | Viewer |
| --- | --- | --- | --- |
| Read authorized parish data, orders, assets, documents | Yes | Yes | Yes |
| Manage parish, members, buildings, bills, appraisals, templates | Yes | No | No |
| Create/update maintenance tasks | Yes | Yes | No |
| Delete tasks | Yes | No | No |
| Create/claim work orders | Yes | Yes | No |
| Start/hold/resume/submit orders | Any parish order | Own assigned order | No |
| Close submitted order after review | Yes | No | No |
| Create/update/delete asset register and financial accruals | Yes | No | No |
| Attach/remove asset maintenance documents/catalog names | Yes | Yes | No |

Every scoped API checks membership server-side; nonmembers receive 404. Global
profile endpoints operate only on the authenticated subject. Templates are now
parish-scoped too, including defaults and the upload parser's template selection.
Team confirmation is requested for Admin-only close/asset financial edits and
Editor document removal. UI controls follow this policy; backend checks remain
authoritative. Audit entries retain actor identity snapshots.

Invitations expire after seven days using their existing creation timestamp.
New tokens are stored as SHA-256 digests; existing raw tokens remain accepted
within the same expiry window. Verified Auth0 email is required. Tokens are
single-use, never listed, and no GET implicitly accepts an invitation. Expired
entries can be removed by an Admin before generating a replacement. Last-admin
changes and order numbering/claims use PostgreSQL row locks.

## Database rollout

`app.main` no longer migrates PostgreSQL when imported. `python -m app.migrations`
prints a plan; `--apply` is explicit. The migration creates missing tables and
adds nullable parish ownership, work-order todo linkage, and template parish
ownership columns where required. It does not drop tables/constraints, clear
rows, or assign existing parishes/templates to an arbitrary first user.

Before a real rollout, take a database backup, review the plan, inventory legacy
schema differences, and approve an explicit owner/member/template mapping.
Unowned legacy records remain inaccessible. Existing global parish-name unique
constraints are retained, so legacy installations can still reject names used
by another owner with HTTP 409. Relaxing that constraint needs a separate reviewed
migration. SQLite and disposable PostgreSQL checks do not replace rollout review.

No integration migration was applied to the existing `parish_db` database.

## Run the isolated demo

From this integration worktree, with `aoa-dev` activated and dependencies installed (the Python launcher works without changing Windows PowerShell execution policy):

```powershell
python .\scripts\run_demo.py prepare --configuration-root C:\Users\rayee\Documents\aoa-docparse
```

Run each server in its own PowerShell window:

```powershell
python .\scripts\run_demo.py backend --configuration-root C:\Users\rayee\Documents\aoa-docparse
python .\scripts\run_demo.py frontend --configuration-root C:\Users\rayee\Documents\aoa-docparse
```

The helper reads the existing private environment files without changing them.
It forces the API to `.demo/demo.sqlite`, on port 8001, and Vite to 5174. Prepare
refuses to overwrite an existing database. On reuse, only the isolated demo's
explicit additive migration runs. Synthetic parish, building, boiler, task and
work-order data are seeded; an existing local administrator's sign-in identity
may be copied read-only for Auth0 access. No real parish documents are copied.

Open http://localhost:5174, sign in yourself, select Synthetic Demo Parish, and
inspect Assets and Active Risks / Work Orders. Claim, start, hold/resume, submit
with completion notes, then close as Admin. The generated synthetic PDF is under
`.demo/synthetic-appraisal.pdf`; use it for local appraisal preview and asset
document checks. Never use sensitive parish documents for utility AI testing.

Auth0 must allow `http://localhost:5174/callback` and the 5174 web/logout origin.
The original application continues on 5173/8000. The separate demo currently
encounters an Auth0 callback mismatch until that configuration is provided.

## Checks

From `backend`, using a Python environment with requirements and pytest:

```powershell
$env:DATABASE_URL='sqlite://'
python -m pytest tests -q
python -m unittest discover -s tests -v
```

PostgreSQL concurrency tests skip unless `TEST_POSTGRES_URL` is supplied. They
reject any host/port other than localhost:55432 and create unique test schemas.
During verification a separate ephemeral PostgreSQL 16 container was used; the
real parish container and volume were never reset.

From `frontend`: `npm ci`, `npm run build`, `npm run lint`, `npm audit`.
Tests use synthetic PDFs, mocked OpenAI transport, in-memory databases and temp
storage. No invitation emails or live AI requests are sent by the suites.

## Remaining limits

Asset files still use temporary local disk, and catalog entries are sample
names, not real manufacturer downloads. Production needs private object storage,
backups, quotas, malware scanning and real catalog sources. Upload magic/extension
checks and a 25 MB limit do not constitute malware validation. Heuristic life,
cost and inflation assumptions are rough suggestions, not sourced appraisals.

Live Editor/Viewer sessions, SMTP, OpenAI extraction, OCR accuracy and the full
signed-in unified browser demo remain unverified until configuration/accounts
are available. Existing backend deprecation warnings and the frontend large
bundle warning remain visible; lint rules were not disabled.

## Draft PR order

The role-hardening PR targets `role-selection` for review within that history.
Do not merge it directly into main using unrelated histories. Its foundation is
already ported into this integration branch.

The unified draft targets `work-order-lifecycle`, excluding PR #1's own changes
from its review diff. Review PR #1 first; after it is approved and merged into
`work-orders`, retarget the unified draft to `work-orders` and recheck the diff.
Promotion of work-orders to main is a separate approved team merge. No shared
branch or PR has been merged by this work.

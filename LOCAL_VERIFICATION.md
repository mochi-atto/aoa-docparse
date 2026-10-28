# Local verification — 2026-10-27

## Running

- Branch: `rayeed-role-management`, HEAD `c9456fd`. Initially clean working tree.
- Origin: `https://github.com/mochi-atto/aoa-docparse.git`.
- Existing Docker container `parish_db` reused, PostgreSQL 16.15, bound to `127.0.0.1:5432`. No database reset, volume removal, or test fixtures written to PostgreSQL. Normal application startup performs its existing create-table/migration logic.
- Backend: http://localhost:8000; docs: http://localhost:8000/docs.
- Frontend: http://localhost:5173.
- Existing Conda `aoa-dev`: Python 3.11.17. Base Python is 3.13.12 and was not used.
- Node 22.15.0, npm 10.9.2, Docker 29.2.1, Compose 5.1.0.
- Environment files preserved; only presence/equality checks were output. Database settings match Docker, database host is local, and frontend/backend Auth0 domain and audience match. OpenAI key is absent.

## Commands and actual results

Commands below run from the indicated directory. Python commands used the existing executable `C:\Users\rayee\miniconda3\envs\aoa-dev\python.exe`.

| Directory | Command / check | Result |
| --- | --- | --- |
| root | `git status --short --branch`, `git branch -avv`, `git remote -v`, `git log -6 --oneline`, `git diff --stat` | Initially clean; expected branch and origin |
| root | `docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'` | Existing `parish_db` up 4 days; sandbox needed elevated read access |
| backend | `python -m pip check` | `No broken requirements found.` |
| frontend | `npm.cmd ls --depth=0` | Exit 0; required packages installed, several extraneous platform/runtime packages |
| backend | `python -m unittest discover -s tests -p test_rbac.py -v` | Original suite: 9 tests, OK |
| backend | `python -m unittest discover -s tests -p test_ocr.py -v` | Original script failed: `ModuleNotFoundError: No module named 'pytesseract'` |
| backend | `python -m unittest discover -s tests -p test_parsers.py -v` | New regression reproduced `TypeError: Object of type date is not JSON serializable` before fix |
| backend | Offline `OpenAI(api_key='synthetic-offline-test')` construction | Reproduced `TypeError: Client.__init__() got an unexpected keyword argument 'proxies'`; no request made |
| backend | `python -m unittest discover -s tests -v` | Final suite: **17 tests in 1.048s, OK** |
| frontend | `npm.cmd run build` | Exit 0; TypeScript and Vite build pass, 650 modules; large chunk warning |
| frontend | `npm.cmd run lint` | Exit 1: **122 errors, 1 warning**; mainly explicit `any`, plus unused variable, empty block, missing effect dependency |
| backend | `python -m uvicorn app.main:app --host 127.0.0.1 --port 8000` | Application startup complete; restarted after fixes |
| frontend | `npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort` | Vite ready |
| root | HTTP checks | Health/docs/frontend return 200; Vite `/api/health` proxy returns healthy; CORS preflight returns 200 with localhost:5173 origin |
| root | Unauthenticated GETs to parishes, account, members, tasks, utility data | All return 403 |
| root | PostgreSQL read-only connection checks | `SELECT 1` returns 1; version 16.15 |
| root | `git diff --check` | Pass |

## Fixed, uncommitted

- Nested dates in appraisal template sections now serialize using FastAPI's recursive JSON encoder. Synthetic PDF regression and isolated upload/persistence test cover the failure.
- Utility parser supplies an explicit HTTPX client to the pinned OpenAI SDK and closes it with a context manager. A real SDK request through HTTPX MockTransport verifies compatibility without network access.
- Replaced import-time parser demo and obsolete native OCR script with offline unit tests. Discovery no longer parses bundled documents or calls OpenAI.
- Added upload denial tests for Editor, Viewer, and nonmember before parsing. Existing tests cover parish-specific roles, maintenance create/update/delete/history, cross-parish isolation, last-admin protection, invitation identity matching, single-use tokens, and SMTP-unavailable behavior.
- Documented the complete offline backend test command in README.
- Corrected six broken Manage Members labels (question-mark separators, close button, loading/saving/working text). Visually verified the updated dialog and reran `npm.cmd --prefix frontend run build`: exit 0, 650 modules, TypeScript/Vite pass; existing large-chunk warning remains.

No dependency installation or version changes were needed. No environment files changed, commits, pushes, branch switches, merges, rebases, cherry-picks, or PR mutations performed.

## Browser and untested paths

The browser connector reported `The browser access host is unavailable`. Used the computer-use skill to open the app in Arc. Visually verified the login card and successful navigation to Auth0's sign-in page. The user completed sign-in; no passwords handled.

Authenticated UI checks **PASS** for the current Admin session:

- Parish selector loads the accessible parish with its Admin role and three building labels; selecting it opens the dashboard.
- Dashboard, Utility Use, Building Valuations, Active Risks, Finances, and History tabs render. Two existing maintenance tasks and six history records display. Utility/appraisal data are empty, and the corresponding empty states render correctly.
- Manage Members loads four existing entries: an active Admin, active Editor, pending Editor invitation, and active Viewer. Last-admin role/removal controls are disabled. Invitation email/role controls render; no invitation was generated or emailed, and no roles were changed.
- Authenticated backend logs return 200 for parish selection/details, parish membership, member list, tasks, history, utility/appraisal data, and templates. No live records were edited.

Live Editor/Viewer sessions and cross-parish UI denial remain **NOT TESTED**; role/isolation mutation coverage uses the isolated backend tests. Actual SMTP delivery, live OpenAI extraction, browser Tesseract OCR, and end-to-end PDF workflows remain **NOT TESTED**. Attempted browser appraisal preview with a newly generated synthetic PDF, but Windows denied Arc access to the generated temporary folder; cancelled the permission prompt without changing access and cancelled file selection. No file was staged/uploaded. Bundled sample PDFs were not submitted to AI.

## Remote branch inspection and next integration steps

`git fetch origin` completed after sandbox escalation; no local branch moved.

| Remote branch | Tip | Finding |
| --- | --- | --- |
| role-selection | f0163aa | Direct ancestor of role-management |
| rayeed-role-management | c9456fd | Current branch; parish-scoped RBAC/member management |
| work-orders | df0c011 | Same tip as remote main at inspection time; newer parser/dashboard/profile work |
| work-order-lifecycle | f86d39e | Two lifecycle commits over 82fbd2a; claim/start/hold/resume |

`git merge-base origin/role-selection origin/work-orders` returned no output and exit 1, confirming unrelated histories. Role-management shares f0163aa with role-selection. [PR #1](https://github.com/mochi-atto/aoa-docparse/pull/1) is open, head `work-order-lifecycle`, base `work-orders`; its changes are 166 additions and 1 deletion across two files. Submit/close routes remain unfinished; technician display names need profile fallback.

The inspected work-order permission layer hardcodes authenticated users to Admin. Its list endpoint filters records by parish ID but does not validate parish membership. These are integration blockers; the isolated RBAC pass on the current branch does not validate work-order authorization.

Next: review these local fixes, finish additional-role/PDF smoke tests with designated test accounts and accessible synthetic files, then obtain approval for an integration strategy. Establish a canonical history in a separate approved integration branch/worktree; reconcile Account/ParishMember with UserProfile/CurrentUser and apply parish access dependencies to all work-order operations. Design additive schema migrations (including todo_id) and back up PostgreSQL before schema integration. Add cross-parish and role/lifecycle regression coverage before considering PR #1. Do not force unrelated histories or reset database volumes.


## Role-hardening review branch update

The sections above are the historical verification of the preserved original
working directory. This review branch also includes the subsequent hardening:
7-day invitation expiry and hashed new tokens, verified email and identity
collision/race handling, last-admin race revalidation, audit entries, token log
redaction, bounded PDF uploads, typed member/invitation errors, modal keyboard
focus containment, permission refresh after self-demotion, and patched PDF.js /
React Router dependencies. Database schema changes are now explicit and additive;
app import no longer creates tables or drops the old parish-name constraint.

Current checks: **26 backend unittest tests pass**; frontend TypeScript/Vite
build passes; touched member/invitation/selector/error files pass ESLint;
`npm audit` reports **0 vulnerabilities**. Full branch ESLint still reports
**118 errors, 0 warnings** in the inherited monolithic dashboard/appraisal code.
The unified main-history integration instead uses the split dashboard, fixes
those type/unused-code issues and passes full lint with no rules disabled.

This branch targets `role-selection`, preserving the unrelated role history for
review. Its foundation is manually ported into `codex/unified-parish-management`;
do not merge unrelated histories into main. The original worktree/database are
preserved. Unified demo/browser configuration remains documented separately.

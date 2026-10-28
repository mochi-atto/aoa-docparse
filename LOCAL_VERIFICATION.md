# Unified integration verification

## Current status

- **RUNNING:** isolated synthetic demo at http://localhost:5174 and API at
  http://localhost:8001; original application remains on 5173/8000 and parish_db.
- **PASSING:** unified pytest suite **52 passed**, including four real PostgreSQL
  concurrency tests; unittest discovery also runs the unittest-based subset.
  Unified TypeScript/Vite build passes, ESLint **0 errors / 0 warnings**, and
  npm audit **0 vulnerabilities**. Large-bundle warning and 9 backend dependency
  deprecation warnings remain.
- **BLOCKED:** signed-in unified browser inspection: Auth0 rejects the 5174
  callback URL. Login page and redirect were visually checked; user configuration
  and sign-in were requested. No authentication bypass was introduced.
- **NOT TESTED:** real Editor/Viewer browser accounts, live SMTP/OpenAI, OCR
  accuracy, complete browser PDF workflows. Backend tests use synthetic identities
  and PDF data and mock the AI transport. No emails or live AI requests were sent.

## What changed

Full Account/ParishMember RBAC and invitation foundation was ported from the
unrelated role branch while preserving main's split dashboard and profile API.
Invitations expire, new secrets are hashed, verified identity/email ownership is
enforced, sign-in races are handled, and token-bearing access logs are redacted.
Member changes are audited; the final administrator remains protected by locks.

The existing Work Orders PR's claim/start/hold/resume implementation is retained
as an ancestor, secured with membership and assignee checks, and extended with
submit/completion notes and Admin review/close. Related building/task ownership,
numbering races, claim races, and actor/profile names are covered.

Eric's Asset history/implementation is preserved. Parish access now gates CRUD,
catalog and document endpoints. Upload types/signatures, filenames, count/size
limits and private downloads are validated. Accrual/remaining-life edge cases,
null/whitespace validation and batched document loading are improved. Temporary
disk storage, placeholder catalog and heuristic assumptions remain documented.

Templates and template defaults are parish-scoped. Main's utility normalization,
current-charge prompt and service-type deduplication fixes are preserved.
Nested appraisal dates serialize recursively; parser transport compatibility is
verified with the declared OpenAI 1.55.3 and HTTPX 0.28.1 and mocked responses.

## Actual checks

Commands used the existing `aoa-dev` Python 3.11 environment. Pytest and OpenAI
1.55.3 were installed into the ignored local `.integration/test-deps` directory,
without changing the original environment. The original environment's older SDK
compatibility was also tested earlier. Frontend dependencies were installed only
in the isolated worktrees.

| Check | Result |
| --- | --- |
| `python -m pytest tests -q --disable-warnings` | 52 passed, 9 warnings, 4.90s |
| `python -m unittest discover -s tests -q` | Unittest subset passes; excludes Eric's 10 pytest function tests |
| Role-hardening branch `python -m unittest discover -s tests -q` | 26 passed, 1.112s |
| `npm run build` in unified | TypeScript + Vite pass, 676 modules |
| `npm run lint -- --format json --output-file ../lint-results.json` | Exit 0; 0 errors / 0 warnings |
| `npm audit` | 0 vulnerabilities after patched dependency updates |
| Role-hardening frontend build + touched-file ESLint | Pass |
| Role-hardening full ESLint | 118 remaining errors in its legacy monolithic dashboard/appraisal code; no rule disables |
| Migration plan/apply/idempotency tests | Pass on isolated SQLite; real PostgreSQL fresh schemas created successfully |
| PostgreSQL last-admin demotion race | Exactly one demotion succeeds; an administrator remains |
| PostgreSQL double claim / numbering / first sign-in | One claim winner; distinct numbers; one identity row |
| Original and isolated API health / proxy | HTTP 200 |
| `git diff --check` | Pass |

The PostgreSQL checks used a separate ephemeral `aoa-integration-verification`
container bound only to 127.0.0.1:55432 and unique synthetic test schemas. The
existing PostgreSQL volume was never reset. Additive migration was applied only
to the isolated SQLite demo; no integration migration touched parish_db.

## Review and demo

See [INTEGRATION_REVIEW.md](INTEGRATION_REVIEW.md) for permission policy, attribution,
dependency/merge order, migration limitations, and exact PowerShell-friendly
Python demo launcher commands. The original working directory still contains
the user's uncommitted local fixes. New commits and pushes belong only to the
new review branches. No shared branch or PR was merged or force-pushed.

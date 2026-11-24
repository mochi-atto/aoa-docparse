# Utility consumption and notes — AOA-38 / AOA-47

## User-facing behavior

Expanded bill lists show actual billed quantity/unit, billing dates, energy per
square foot and an optional bill-level usage note. Admins can add/edit/clear the
note; viewers and editors retain existing read-only utility permissions. Notes
are limited to 2,000 characters; empty or null clears the note. Older records
show no note and unavailable metrics. A manual utility-entry form in Utility Use
provides a fallback when extraction fails. Existing appraisal entry is preserved.

## Field and calculation decisions

Keep the existing `usage_quantity`, `usage_unit`, `billing_period_start` and
`billing_period_end` fields. Missing usage is null; actual zero is 0. Extraction
instructions distinguish current billed consumption from charges, demand,
cumulative readings, comparison charts and prior periods. The raw parser
response remains available in `raw_extracted`. This is a prompt/normalization
change; offline tests cannot establish live-model extraction accuracy.

Canonical units: electricity kWh, gas therms, water gallons where printed. Safe
aliases are normalized; MWh converts to kWh. Unknown volume units remain recorded
in their original unit. In particular gas CCF/MCF is **not** converted to therms
without a printed supplier heat factor. Water remains outside energy density.

Per bill: `(electric kWh × 3.412 or gas therms × 100) / building ft²`, labelled
`kBtu/ft² for this bill period`. These are site energy factors from
[the EPA thermal conversion reference](https://portfoliomanager.energystar.gov/pdf/reference/Thermal%20Conversions.pdf).
No annualizing, weather normalization, ENERGY STAR score or cross-period
aggregation is performed. Without full dates the UI identifies the bill date
and explicitly says period unavailable.

Area comes from the latest unambiguous valuation of the same building in this
parish, dated on/before the billing period end (or bill date). The existing
per-building appraisal sections and legacy entity-name/gross_sq_ft fallback are
used. Show source area/date. No future valuation or another parish's area is
used. Missing, zero, nonfinite or ambiguous area produces no density. Shared
meters are not allocated across buildings; that needs the team's meter model.

The supplied WELab AoA PRD (Nov 2 decisions) confirms kWh/therms/gallons and
valuation area. Git history, repository PRs and accessible Drive searches for
AOA-36 / Portfolio Manager / ENERGY STAR did not surface Marleigh/Reese's separate
field report. Alignment still needed: meter/account identity and shared building
allocation; canonical unit enums and gas heat factors; period-boundary semantics;
valuation effective dates; annual site/source EUI versus this per-bill density.
No Portfolio Manager connection, import or account linking is implemented.

## Schema and export

One nullable column: `utility_bills.usage_note VARCHAR(2000)`. Review
`python -m app.migrations`, apply explicitly before serving. Legacy rows remain
intact with a null note. Clean creation, SQLite upgrade and PostgreSQL 16 upgrade
are covered, including existing zero-use bills and idempotent repeat.

The existing AOA-39 workbook adds its planned Notes text column. Usage columns
remain separated by unit. Formula-looking notes remain literal Excel text.
No export redesign or dependency/lockfile changes are included.

## Verification

From backend, `DATABASE_URL=sqlite:// AOA_ENV_FILE=/dev/null`, optionally
`TEST_POSTGRES_URL` pointing to a disposable PostgreSQL 16 service at
127.0.0.1:55432:

```
venv/bin/python -m pip check
venv/bin/python -m pytest tests -q
venv/bin/python -m unittest discover -s tests -q
```

Frontend: `npm ci`, `npm test`, `npm run lint`, `npm run build`.

Repeatable browser acceptance (requires local Chrome and Node 22.18+):

```
npm install --prefix /tmp/aoa-browser playwright
AOA_PLAYWRIGHT_MODULE=/tmp/aoa-browser/node_modules/playwright/index.mjs \
  node scripts/verify_utility_browser.mjs
```

This launches an isolated synthetic SQLite application, real Vite frontend and
headless Chrome. The Auth0 provider and parser responses are controlled only in
the harness; production app code contains no bypass. The browser performs PDF
selection → Parse & Upload → Utility Use → period/usage/density → note add/edit/
clear → reload; checks a legacy bill and manual zero-use bill without area.
No external parser calls or identifiable parish files are used.

## Hosted acceptance still pending

After team deployment and migration to an authorized test tenant:
1. As Admin upload sanitized electric, gas and water bills with explicit usage,
   period dates, comparison charts and cumulative readings; compare extraction
   to the printed billed totals. Confirm null versus zero and unit separation.
2. Set a known valuation area; verify bill density and source area/date. Try
   missing/zero area, an older bill and an unsupported gas-volume unit.
3. Add, edit and clear a note; hard reload after each. Verify Viewer/Editor cannot
   write, and another parish's members cannot read or edit these bills.
4. Fail extraction, retry safely, and use manual entry. If AOA-25/26 is deployed,
   repeat concurrent upload/retry/visibility checks from its verification guide.
5. Export the parish; inspect Notes and existing unit-specific usage columns.

No production keys, hosting changes, deployment or Portfolio Manager integration
are required or performed by this PR. Both utility PRs are based on main and can
be reviewed independently; they share small parser/list/UI hunks that should be
reviewed together on integration. Apply the combined additive migration plan.

Executed locally: pip check passed; pytest with disposable PostgreSQL 16 passed
81 tests with no skips; unittest discovery passed 68 tests. Frontend 4 tests,
lint and production build passed. Headless Chrome acceptance passed the real
upload/list/usage/note/reload/manual-entry flow above with controlled auth/parser.
Existing Pydantic deprecations and Vite bundle-size warning remain.

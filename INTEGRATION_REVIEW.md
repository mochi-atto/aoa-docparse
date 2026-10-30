# Unified application setup and rollout

See [UNIFIED_INTEGRATION.md](UNIFIED_INTEGRATION.md) for contributor history and
[LOCAL_VERIFICATION.md](LOCAL_VERIFICATION.md) for executed checks.

## Apple Silicon local setup

Use Homebrew Python 3.11 and Node 22.18+; Docker Desktop runs PostgreSQL 16
natively on ARM64. The frontend and backend run natively on macOS. Do not
replace an existing environment file or reuse an unknown database volume.

```bash
# Repository root; create files only when they do not already exist.
cp -n docker/.env.example docker/.env
cp -n backend/.env.example backend/.env
cp -n frontend/.env.example frontend/.env
/opt/homebrew/bin/python3.11 -m venv backend/venv
backend/venv/bin/python -m pip install -r backend/requirements.txt
npm --prefix frontend ci
```

Set local database credentials in docker/.env and the matching DATABASE_URL in
backend/.env. For this Mac's existing development setup, always use the same
Compose project name so a second volume is not accidentally selected:

```bash
docker compose -p aoa-docparse-local -f docker/docker-compose.yml up -d
```

For a new, empty, approved database, review and explicitly apply the schema:

```bash
cd backend
venv/bin/python -m app.migrations
venv/bin/python -m app.migrations --apply
```

Run in two terminals:

```bash
cd backend
venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

```bash
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open http://localhost:5173 and http://localhost:8000/docs. Health is
/api/health; /api/ready checks database connectivity and the known migration plan
without modifying tables. Use `docker compose -p aoa-docparse-local -f
docker/docker-compose.yml stop` to preserve the development volume.

## Credentials and authentication

Backend requires DATABASE_URL. Auth0 sign-in requires AUTH0_DOMAIN and
AUTH0_API_AUDIENCE, plus matching VITE_AUTH0_DOMAIN, VITE_AUTH0_CLIENT_ID and
VITE_AUTH0_AUDIENCE in frontend/.env. AUTH0_ALGORITHMS defaults to RS256.
Request scopes are openid/profile/email. Verified email is required for invitation
acceptance, with authenticated Auth0 userinfo fallback when needed. API requests
obtain current SDK tokens; failures are surfaced instead of silently hiding modules.

Register the SPA callback http://localhost:5173/callback and web/logout origin
http://localhost:5173 in Auth0. If using isolated ports 5174/8001, register
http://localhost:5174/callback and the 5174 origins too. Restart Vite after changing
frontend environment values. VITE_API_BASE_URL is not used: /api is proxied by
Vite; AOA_API_TARGET optionally changes the target (default localhost:8000).
Production hosting must route /api to the backend as well.

OPENAI_API_KEY is required only for utility extraction. Appraisals use local
PDF processing/manual entry. Invitations return a shareable link on localhost;
production email requires SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD,
SMTP_FROM and FRONTEND_URL. Configure ALLOWED_ORIGINS to the actual frontend.
ASSET_UPLOAD_DIR selects private persistent document storage. Never commit .env.

## Permission policy

| Operation | Admin | Editor | Viewer |
| --- | --- | --- | --- |
| Read parish data, orders, assets, documents | Yes | Yes | Yes |
| Manage parish, members, bills, appraisals, templates | Yes | No | No |
| Create/update maintenance tasks; create/claim orders | Yes | Yes | No |
| Start/hold/resume/submit orders | Any parish order | Own assigned order | No |
| Review/close submitted orders; delete tasks | Yes | No | No |
| Change asset register and financial values | Yes | No | No |
| Attach/remove asset maintenance documents | Yes | Yes | No |

Roles are parish-specific; the selector displays the effective membership role.
The member-management UI assigns roles through authenticated Admin actions.
Users cannot self-select a privileged role. Nonmembers receive 404 for scoped
resources. Seven-day invitations are hashed, verified-email matched and single-use.
The final Admin is protected with PostgreSQL locking. Work-order claim and
numbering use database locks. Audit entries record membership, lifecycle and
upload events; no invitation secrets are listed.

## Existing database rollout

This integration does not migrate the existing development volume or any shared
or production database. On a disposable database it verifies creation of 13
application tables and additive legacy migrations. The plan adds missing
parishes.owner_account_id, work_orders.todo_id, work_orders.status_before_hold,
and extraction_templates.parish_id. Referenced tables are created first.
No tables, constraints or records are removed, and repeat application is safe.
The plan covers known repository schemas, not arbitrary historical schema drift.

Before upgrading a populated database, back it up, inventory its schema, review
the dry-run, and approve explicit owner/member/template mappings. Unowned legacy
parishes and global templates stay inaccessible until mapped; they are never
assigned to the first user. Existing global parish-name uniqueness is retained.
A conflicting create returns HTTP 409. Relaxing that constraint requires a
separate reviewed migration.

## Deployment limits

Eric's local document storage and sample manual-name catalog are preserved and
labelled temporary. Deployment needs durable private storage, backup policy and
a real manual source. Upload validation is bounded to 25 MB and checks file
signatures; it does not replace malware scanning. Financial heuristics remain
suggestions. Live Auth0/browser role accounts, OpenAI extraction, SMTP and OCR
accuracy require user configuration and acceptance testing. This integration is
not a claim of completed production acceptance.

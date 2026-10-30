# AoA Parish Management System

A web application for church parishes to upload, parse, and manage utility bills and insurance appraisals. Built with React + FastAPI + PostgreSQL. Currently under development.

## Overview

This system helps diocesan property managers track utility costs and building valuations across multiple parish properties. Upload a utility bill PDF and the system extracts structured data using OpenAI. Scanned utility bills are OCRed in the browser with Tesseract.js before their text is sent to the backend. Appraisals are entered through a guided form with PDF preview — no AI involved, keeping confidential appraisal data local.

### Key Features

- **Utility Bill Parsing** — Upload PDF utility bills. Embedded PDF text is extracted in the browser; scanned pages are OCRed locally with Tesseract.js. The extracted text is sent to the backend, where OpenAI extracts provider, amount, date, account number, and utility type.
- **Appraisal Entry** — Upload appraisal PDFs and enter data via a side-by-side guided form. PDF renders in-browser; values are copy-pasted with automatic cleaning (strips `$`, commas, labels). Fully local — appraisal files and extracted appraisal data are never sent to OpenAI or another AI service.
- **Dashboard** — Single-page overview with tabs for utility trends, building valuations, active risks/tasks, finances, and history.
- **Building Management** — First-class building entities with per-building utility account tracking, valuation history, and task assignment.
- **General Expenses** — Virtual category for non-building-specific utility bills (e.g., shared internet, parish-wide water).
- **Inline Editing** — Edit any utility bill field directly from the utility tab or history tab. Changes are logged automatically.
- **History & Audit Trail** — All mutations (uploads, edits, deletions, task changes) are logged with timestamps. Removed data shows as greyed/strikethrough rather than disappearing.
- **Task Management** — Track maintenance tasks per building with priority levels (Overdue, At Risk, Due Soon, Addressed).
- **Toast Notifications** — Visual feedback for all actions.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, TypeScript, Tailwind CSS, Recharts, PDF.js, Tesseract.js |
| Backend | Python 3.11, FastAPI, SQLAlchemy, Pydantic |
| Database | PostgreSQL 16 (Docker) |
| Auth | Auth0 |
| AI | OpenAI API (utility bills only) |

## Project Structure

```
parish-document-parser/
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── CallbackPage.tsx
│   │   │   ├── ParishSelectPage.tsx      # Parish list + create
│   │   │   ├── DashboardPage.tsx         # Main dashboard (all tabs)
│   │   │   ├── AppraisalEntryPage.tsx    # PDF preview + guided form
│   │   │   └── AccountPage.tsx           # Profile, password, delete
│   │   ├── services/
│   │   │   ├── api.ts                    # Axios instance + auth
│   │   │   └── browserOcr.ts              # PDF text extraction + browser OCR
│   │   └── App.tsx                       # Routes
│   └── package.json
├── backend/
│   ├── app/
│   │   ├── models/
│   │   │   ├── parish.py
│   │   │   ├── building.py
│   │   │   ├── utility_bill.py
│   │   │   ├── appraisal.py
│   │   │   ├── todo.py
│   │   │   └── history_entry.py
│   │   ├── routers/
│   │   │   ├── parishes.py              # Parish + building CRUD
│   │   │   ├── upload.py                # File upload; utility AI, appraisal local
│   │   │   ├── data.py                  # Utility/appraisal data + edit/delete
│   │   │   └── parish_data.py           # Todos + history
│   │   ├── schemas/
│   │   │   └── documents.py
│   │   ├── parsers/
│   │   │   ├── utility_parser.py        # OpenAI-based extraction
│   │   │   └── appraisal_parser.py      # Local text extraction
│   │   ├── auth.py                      # Auth0 token verification
│   │   ├── config.py                    # Settings from env
│   │   ├── database.py                  # SQLAlchemy setup
│   │   └── main.py                      # FastAPI app
│   └── requirements.txt
└── docker/
    └── docker-compose.yml               # PostgreSQL
```

## Setup

### Parish roles

Parish membership determines access: **Admin** manages parish data and members,
**Editor / Technician** creates and updates maintenance tasks, and **Viewer** has
read-only access. A user's role can differ between parishes. The last active
administrator cannot be removed or demoted.

Administrators open **Manage Members** on the dashboard to list members, change
roles, remove access, or generate an invitation for an editor or viewer. When
`FRONTEND_URL` points to localhost and SMTP is unavailable, a copyable invitation
link is returned to the administrator; no email is claimed to have been sent.
On production URLs, SMTP must be configured. Configure `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`, and `FRONTEND_URL` for email delivery.
Recipients sign in with Auth0 using the invited email and click **Accept
Invitation**. Tokens are single-use and are never returned by member lists.

Run permission regression tests from `backend` with:
`python -m unittest discover -s tests -p test_rbac.py -v`.
These tests use an isolated in-memory database and never reset PostgreSQL.

Run all offline backend regressions from `backend` with:
`python -m unittest discover -s tests -v`.
The parser tests generate synthetic PDFs and mock AI responses; they do not
upload sample documents, call OpenAI, send invitation emails, or require native
Tesseract. Browser OCR itself still needs a browser smoke test.

### Prerequisites

- Node.js 18+
- Python 3.11+
- Docker (for PostgreSQL)
- Auth0 account (free tier works)
- OpenAI API key (required for utility bill extraction only)

This repository is public. Do not commit passwords, API keys, Auth0 secrets, tokens, or production connection strings. Ask the development team for the private development credentials and store them only in local `.env` files. `.env` files are ignored by Git.

No native Tesseract installation is required. OCR for scanned utility bills runs in the browser using Tesseract.js. The first OCR run downloads the Tesseract worker, language data, and WebAssembly core, so the browser needs network access unless those assets are self-hosted.

### 1. Environment setup

This repository intentionally keeps real secrets out of Git. Create local `.env` files from the example templates in each folder, then fill in your own values.

Copy the example files before editing them:

```bash
cp backend/.env.example backend/.env
cp docker/.env.example docker/.env
cp frontend/.env.example frontend/.env
```

1. Start with the Docker database values in `docker/.env`.
2. Use those exact values in the backend `DATABASE_URL` in `backend/.env`.
3. Add the Auth0 values in both the backend and frontend env files.
4. Add your own OpenAI API key in `backend/.env`.

Use the local values from the project team where required:

- For Auth0 values, look in the Auth0 dashboard for the application/domain, client ID, and API audience. If you are working on this repo with the project team, reach out to the project maintainer for the shared development values.
- (Local Testing) For the OpenAI key, create or access your own API key in the OpenAI dashboard and place it in `backend/.env`.
- For the database values, check the local Docker config in `docker/.env`: `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`. Those values are the same ones that should be used in the backend connection string `DATABASE_URL`.

Do not commit any real `.env` file.

### 2. Database

The Docker Compose configuration runs PostgreSQL only. It does not build or run the backend or frontend. `docker compose up -d` creates the database container if it does not already exist and starts it in the background; subsequent runs start the existing container.

Create `docker/.env` first using your local values:

```env
POSTGRES_USER=your_local_db_user
POSTGRES_PASSWORD=your_local_db_password
POSTGRES_DB=your_local_db_name
```

These are the values that will power the local Postgres container. The backend database URL must match them exactly.

```bash
cd docker
docker compose up -d
```

PostgreSQL is available only from the local computer at `127.0.0.1:5432`.

Check the container status and logs:

```bash
docker compose ps
docker compose logs -f db
```

Press `Ctrl+C` to stop following logs. To stop the database while keeping its data:

```bash
docker compose stop
```

To stop and remove the container while keeping its data volume:

```bash
docker compose down
```

Local verification must preserve the existing database. Use `docker compose stop`
to stop PostgreSQL while keeping its data; do not remove the data volume.

### 3. Backend

```bash
cd backend
py -3.11 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

The backend requirements do not include `pytesseract` or a native Tesseract executable. The backend handles PDF uploads and OpenAI utility extraction; browser OCR supplies text for scanned utility PDFs.

Create a `.env` file in `backend/` from the example file and fill in your values:

```env
DATABASE_URL=postgresql://your_local_db_user:your_local_db_password@localhost:5432/your_local_db_name
OPENAI_API_KEY=your_openai_api_key_here
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_API_AUDIENCE=your-api-identifier
AUTH0_ALGORITHMS=RS256
ALLOWED_ORIGINS=http://localhost:5173
```

Notes:

- `OPENAI_API_KEY` should be your own API key; do not reuse someone else’s key.
- `AUTH0_DOMAIN`, `AUTH0_API_AUDIENCE`, and related values should be requested from the project maintainer.
- `AUTH0_ALGORITHMS` and `ALLOWED_ORIGINS` are optional and usually default correctly for local development.

Run the server:

```bash
uvicorn app.main:app --reload --port 8000
```

Schema creation and upgrades are explicit. Review `python -m app.migrations`,
then apply only to an approved target with `python -m app.migrations --apply`.
The app no longer changes PostgreSQL tables or drops constraints on import.

### 4. Frontend

```bash
cd frontend
npm install
```

This installs the frontend OCR dependency (`tesseract.js`) as well as the existing PDF.js dependency. No separate OCR installer is needed on the developer machine or end-user machine.

Create a `.env` file in `frontend/` from the example file and fill in the Auth0 values:

```env
VITE_AUTH0_DOMAIN=your-tenant.auth0.com
VITE_AUTH0_CLIENT_ID=your-client-id
VITE_AUTH0_AUDIENCE=your-api-identifier
```

Run the dev server:

```bash
npm run dev
```

Open `http://localhost:5173`.

## Usage

### Creating a Parish

1. Sign in → you'll land on the parish selection page
2. Click **"+ Create New Parish"**
3. Enter the parish name and list each building on the property
4. "General Expenses" is available as a virtual category on the utility tab (not created as a building)

### Uploading Utility Bills

1. On the dashboard, select **"Utility"** in the upload bar
2. Click **"+ Add Files"** and select one or more PDF bills
3. Click **"Parse & Upload"** — text-based PDFs are read in the browser; scanned PDFs are OCRed in the browser, then the extracted text is sent to OpenAI for structured extraction
4. Bills appear on the Utility tab grouped by building/account

### Entering Appraisal Data

1. Select **"Appraisal"** in the upload bar
2. Add the appraisal PDF and click **"Enter Data"**
3. The PDF renders on the left; a form appears on the right
4. Copy values from the PDF and paste into the form — dollar signs, commas, and labels are stripped automatically
5. Buildings are pre-populated from your parish's building list
6. Click **"Save Appraisal"**

Appraisal privacy boundary: appraisal PDFs are rendered and parsed locally with PDF.js, `pdfplumber`, and the guided form. The appraisal upload path calls `parse_appraisal` only and does not call the OpenAI client. OpenAI is used by the utility parser only.

### Managing Accounts

On the Utility tab, the amber **Account Management** panel lets you:

- **Assign unassigned accounts** to buildings or General Expenses
- **Add/remove utility types** per building (not all buildings have all utilities)
- **Edit account numbers** by clicking the number on any building card
- **Unassign from General Expenses** by clicking ✕ on a utility chip

### Editing Data

- **Utility tab**: Click "View/Edit X bills ▾" on any building card to expand the bill list. Click any value to edit inline.
- **History tab**: Click "View/Edit ▾" on any upload entry to see and edit all records from that file.
- All edits are logged to the history timeline.

### Utility Type Normalization

The system normalizes utility types from LLM output:

| Input | Normalized To |
|-------|--------------|
| electricity, power | electric |
| trash, garbage, refuse, solid waste | waste |
| sewer, sewage, wastewater | waste |
| natural gas | gas |

## API Endpoints

### Parishes
- `GET /api/parishes/` — List all parishes
- `POST /api/parishes/` — Create parish (with buildings)
- `GET /api/parishes/{id}` — Get parish details
- `PUT /api/parishes/{id}` — Update parish
- `POST /api/parishes/{id}/buildings` — Add building
- `PUT /api/parishes/{id}/buildings/{bid}` — Update building (name, account numbers)
- `DELETE /api/parishes/{id}/buildings/{bid}` — Remove building

### Data
- `GET /api/data/utility/{parish_id}` — Get utility bills (normalized types, resolved building names)
- `PUT /api/data/utility/{bill_id}` — Edit utility bill (any field)
- `DELETE /api/data/utility/{bill_id}` — Delete utility bill
- `GET /api/data/appraisal/{parish_id}` — Get appraisal data (per-building entries)
- `POST /api/data/appraisal/manual` — Save manually entered appraisal
- `DELETE /api/data/appraisal/{id}` — Delete appraisal

### Upload
- `POST /api/upload/` — Upload and parse a PDF (utility or appraisal). Utility uploads may include browser-extracted text in the optional `extracted_text` form field; appraisal uploads use local parsing only.

### Todos & History
- `GET /api/parishes/{id}/todos` — List tasks
- `POST /api/parishes/{id}/todos` — Create task
- `PUT /api/parishes/{id}/todos/{tid}` — Update task (text, building, priority, done)
- `DELETE /api/parishes/{id}/todos/{tid}` — Delete task
- `GET /api/parishes/{id}/history` — List history entries
- `POST /api/data/history/{eid}/mark-removed` — Mark history entry as removed

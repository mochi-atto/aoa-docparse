# AoA Parish Management System

A web application for church parishes to upload, parse, and manage utility bills and insurance appraisals. Built with React + FastAPI + PostgreSQL. Currently under development.

## Overview

This system helps diocesan property managers track utility costs and building valuations across multiple parish properties. Upload a utility bill PDF and the system extracts structured data using OpenAI. Appraisals are entered through a guided form with PDF preview — no AI involved, keeping confidential data local.

### Key Features

- **Utility Bill Parsing** — Upload PDF utility bills. An LLM (OpenAI) extracts provider, amount, date, account number, and utility type automatically.
- **Appraisal Entry** — Upload appraisal PDFs and enter data via a side-by-side guided form. PDF renders in-browser; values are copy-pasted with automatic cleaning (strips `$`, commas, labels). Fully local — no data sent to AI.
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
| Frontend | React 18, TypeScript, Tailwind CSS, Recharts, PDF.js |
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
│   │   │   └── api.ts                    # Axios instance + auth
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
│   │   │   ├── upload.py                # File upload + LLM parsing
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

### Prerequisites

- Node.js 18+
- Python 3.11+
- Docker (for PostgreSQL)
- Auth0 account (free tier works)
- OpenAI API key

### 1. Database

```bash
cd docker
docker compose up -d
```

This starts PostgreSQL on port 5432. Default config uses trust auth for local development.

If you need to reset the database (drops all data):

```bash
docker compose down -v
docker compose up -d
```

### 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` file in `backend/`:

```env
DATABASE_URL=postgresql://parish_admin:parish_admin@localhost:5432/parish_docs
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_API_AUDIENCE=your-api-identifier
OPENAI_API_KEY=sk-...
```

Run the server:

```bash
uvicorn app.main:app --reload --port 8000
```

Tables are created automatically on first start via `Base.metadata.create_all()`.

### 3. Frontend

```bash
cd frontend
npm install
```

Create a `.env` file in `frontend/`:

```env
VITE_AUTH0_DOMAIN=your-tenant.auth0.com
VITE_AUTH0_CLIENT_ID=your-client-id
VITE_AUTH0_AUDIENCE=your-api-identifier
VITE_API_BASE_URL=http://localhost:8000/api
```

Run the dev server:

```bash
npm run dev
```

Open `http://localhost:5173`.

### Auth0 Configuration

1. Create a **Single Page Application** in Auth0
2. Set Allowed Callback URLs: `http://localhost:5173/callback`
3. Set Allowed Logout URLs: `http://localhost:5173`
4. Set Allowed Web Origins: `http://localhost:5173`
5. Create an **API** with your chosen identifier
6. Use the domain, client ID, and audience in your `.env` files

## Usage

### Creating a Parish

1. Sign in → you'll land on the parish selection page
2. Click **"+ Create New Parish"**
3. Enter the parish name and list each building on the property
4. "General Expenses" is available as a virtual category on the utility tab (not created as a building)

### Uploading Utility Bills

1. On the dashboard, select **"Utility"** in the upload bar
2. Click **"+ Add Files"** and select one or more PDF bills
3. Click **"Parse & Upload"** — the LLM extracts data from each bill
4. Bills appear on the Utility tab grouped by building/account

### Entering Appraisal Data

1. Select **"Appraisal"** in the upload bar
2. Add the appraisal PDF and click **"Enter Data"**
3. The PDF renders on the left; a form appears on the right
4. Copy values from the PDF and paste into the form — dollar signs, commas, and labels are stripped automatically
5. Buildings are pre-populated from your parish's building list
6. Click **"Save Appraisal"**

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
- `POST /api/upload/` — Upload and parse a PDF (utility or appraisal)

### Todos & History
- `GET /api/parishes/{id}/todos` — List tasks
- `POST /api/parishes/{id}/todos` — Create task
- `PUT /api/parishes/{id}/todos/{tid}` — Update task (text, building, priority, done)
- `DELETE /api/parishes/{id}/todos/{tid}` — Delete task
- `GET /api/parishes/{id}/history` — List history entries
- `POST /api/data/history/{eid}/mark-removed` — Mark history entry as removed
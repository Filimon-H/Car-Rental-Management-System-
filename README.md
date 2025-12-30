# Car Rental Management System

A complete end-to-end car rental management application with role-based access, bilingual UI (English/Amharic), fleet management, agreements, payments, inspections, and reporting.

## Tech Stack

- **Backend**: Python 3.11, FastAPI, SQLAlchemy 2.0, PostgreSQL
- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, shadcn/ui
- **Authentication**: JWT (access + refresh tokens)
- **Document Generation**: docxtpl + LibreOffice (PDF)

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+ (LTS)
- PostgreSQL 14+

### Backend Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env
# Edit .env with your database credentials
alembic upgrade head
uvicorn src.api.main:app --reload
```

### Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

### Access

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

## Project Structure

```
├── backend/
│   ├── src/
│   │   ├── api/          # FastAPI routers and dependencies
│   │   ├── core/         # Config, DB, security, logging
│   │   ├── models/       # SQLAlchemy models
│   │   ├── schemas/      # Pydantic schemas
│   │   ├── services/     # Business logic
│   │   ├── repositories/ # Data access layer
│   │   ├── jobs/         # Background tasks
│   │   └── templates/    # Document templates
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── app/          # App setup, layout
│   │   ├── components/   # Reusable UI components
│   │   ├── pages/        # Page components
│   │   ├── services/     # API clients
│   │   ├── hooks/        # Custom React hooks
│   │   └── i18n/         # Internationalization
│   └── tests/
├── uploads/              # Vehicle photos
├── generated_docs/       # Generated agreements/reports
└── specs/                # Feature specifications
```

## Features

- **User Management**: Role-based access (Admin, Sales, Fleet, Inspector, Accountant)
- **Master Data**: Customers, vendors, vehicles with photos
- **Agreements**: Standard rentals, wedding agreements, vendor supply
- **Finance**: Append-only ledger, payments, adjustments
- **Inspections**: Bilingual checklist templates
- **Printing**: DOCX templates to PDF
- **Dashboard**: Today's returns, overdue, reports

## License

MIT

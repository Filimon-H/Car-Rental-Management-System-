# Research: End-to-End Car Rental Management System

## Decisions

- Decision: Web admin frontend using React + TypeScript + Vite
  Rationale: Fast iteration, strong ecosystem for data-heavy admin tables, good i18n support.
  Alternatives considered: Next.js (more complexity than needed for an internal admin portal MVP).

- Decision: Backend API using FastAPI + Pydantic v2
  Rationale: Strong OpenAPI support, high developer velocity, clear schema validation.
  Alternatives considered: Django REST Framework (heavier weight; slower iteration for this repo).

- Decision: Persistence using PostgreSQL
  Rationale: Strong relational integrity and query capability for reporting.
  Alternatives considered: SQLite (insufficient for multi-user + reporting needs).

- Decision: ORM and migrations via SQLAlchemy 2.0 + Alembic
  Rationale: Mature patterns, migration safety, good compatibility with Postgres.
  Alternatives considered: SQLModel (nice ergonomics but less control for complex domains).

- Decision: Auth via JWT (access + refresh) and RBAC roles
  Rationale: Works well for SPA admin apps; aligns with constitution least-privilege.
  Alternatives considered: Session cookies (fine, but JWT better fits API-first + future integrations).

- Decision: Billing time rule
  Rationale: Business requirement confirmed: 1 rental day = 24 hours, partial day charged as full day.
  Alternatives considered: Calendar-day billing.

- Decision: Wedding vehicle status
  Rationale: Business requirement confirmed: wedding vehicles are rented only during the event window; prior to that they are reserved/scheduled.
  Alternatives considered: Treating vehicles as rented for the entire lead-up period.

- Decision: Ledger model
  Rationale: Append-only ledger with reversals/adjustments (no delete) to preserve auditability.
  Alternatives considered: Mutable invoice rows (harder to audit).

- Decision: Scheduler
  Rationale: Start with APScheduler for a single-server deployment; keep an upgrade path to Celery+Redis.
  Alternatives considered: Celery from day one (additional infra before value).

- Decision: Printing
  Rationale: DOCX templates filled via docxtpl, converted to PDF via headless LibreOffice on server.
  Alternatives considered: HTML-to-PDF (harder to match legacy official formatting).

## Open Questions (deferred)

- Receipt/reference uniqueness rules for payments (recommended: unique receipt number).
- Whether printed agreements should support single-language only or dual-language on one page.
- Whether to implement multi-branch support (locations) in v1 or later.

# Implementation Plan: End-to-End Car Rental Management System
 
 **Branch**: `001-car-rental-e2e` | **Date**: 2025-12-29 | **Spec**: /specs/001-car-rental-e2e/spec.md
 **Input**: Feature specification from `/specs/001-car-rental-e2e/spec.md`
 
 **Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.
 
 ## Summary
 
 Build a complete end-to-end car rental management system (replacing legacy desktop workflows) with:
 - Role-based staff access (Admin, Sales/Front Desk, Fleet Manager, Inspector, Accountant)
 - Master data (customers, vendors, fleet)
 - Agreements (standard + wedding + vendor wedding) with vehicle availability enforcement
 - Ledger-style finance (append-only, reversible via adjustments/reversals)
 - Inspections/checklists and high-quality printing (DOCX templates → PDF)
 - Booking requests (future website + Telegram) and operational notifications
 - Dashboards and reports for daily operations
 
 Technical approach:
 - Web admin app (React + TypeScript) consuming a FastAPI backend
 - PostgreSQL for all operational data, with Alembic migrations
 - Background scheduler for reminders
 - File storage for vehicle photos and generated documents

 Build phases (delivery order):
 1. Auth + Roles + base admin layout
 2. Customers + Vehicles + Vendors
 3. Standard Agreement + Ledger + Agreement Detail tabs
 4. Extend + Replace vehicle
 5. Checklist templates + Inspections + printing
 6. Wedding + Vendor wedding agreements
 7. Booking Requests + Telegram bot
 8. Reports dashboard + polish + deploy
 
 ## Technical Context

**Language/Version**: Backend: Python 3.11; Frontend: Node.js LTS (TypeScript)  
**Primary Dependencies**: Backend: FastAPI, Pydantic v2, SQLAlchemy 2.0, Alembic; Frontend: React, Vite, React Router, TanStack React Query, React Hook Form, Zod, Tailwind CSS, shadcn/ui, i18next  
**Storage**: PostgreSQL (primary) + local file storage for uploads/generated docs (MVP); optional S3-compatible later  
**Testing**: Backend: pytest | Frontend: basic component tests + e2e smoke tests (optional)  
**Target Platform**: Linux server deployment (container-friendly) + developer macOS workstations
**Project Type**: web application (frontend + backend)  
**Performance Goals**: Fast search/lookup and responsive tables for daily operations (pagination for large lists)  
**Constraints**: Availability + ledger correctness are non-negotiable; PII must not be logged; printing must be reliable  
**Scale/Scope**: Single company deployment initially, designed to scale to multiple users concurrently

 ## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

 - Availability & booking integrity: confirm design prevents double-booking and defines vehicle status lifecycle.
 - Pricing & payments: confirm pricing rules are explicit, audited, and payment/refund flows are idempotent.
 - Audit trail: confirm all financial and contract lifecycle changes are traceable (who/when/why).
 - Least privilege & privacy: confirm RBAC scope is defined and PII is not logged.
 - Operational traceability: confirm key workflows have logging/error codes and correlation IDs.
 
 Result: No known violations. Availability enforcement and append-only ledger are core design constraints.

 Post-Phase-1 re-check (after data model + contracts): confirm availability overlap rules, ledger append-only
 invariants, RBAC boundaries, and PII logging rules remain satisfied.

## Project Structure

 ### Documentation (this feature)

```text
 specs/001-car-rental-e2e/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

 ### Source Code (repository root)

 ```text
 backend/
 ├── src/
 │   ├── api/
 │   │   ├── routers/
 │   │   └── deps/
 │   ├── core/
 │   ├── models/
 │   ├── repositories/
 │   ├── schemas/
 │   ├── services/
 │   ├── jobs/
 │   └── templates/
 └── tests/
 
 frontend/
 ├── src/
 │   ├── app/
 │   ├── components/
 │   ├── pages/
 │   ├── routes/
 │   ├── services/
 │   ├── hooks/
 │   └── i18n/
 └── tests/
 
 uploads/
 └── vehicles/
 
 generated_docs/
 └── agreements/
 ```

 **Structure Decision**: Web application split into `backend/` and `frontend/` with a single shared PostgreSQL database.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |

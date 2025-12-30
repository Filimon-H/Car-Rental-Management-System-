---

description: "Tasks for end-to-end car rental management system"
---

# Tasks: End-to-End Car Rental Management System

**Input**: Design documents from `/specs/001-car-rental-e2e/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Include tests when required by the constitution. In particular, any changes that affect availability/booking, pricing/fees, contracts, or payments/refunds MUST include tests.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Create repository project folders per plan in backend/ and frontend/
- [x] T002 Initialize backend Python project scaffold in backend/ (packaging, src layout)
- [x] T003 Initialize frontend React+TS app scaffold in frontend/ (Vite)
- [x] T004 [P] Add backend dev tooling config in backend/ (format/lint/test runner config)
- [x] T005 [P] Add frontend dev tooling config in frontend/ (format/lint)
- [x] T006 Add basic documentation placeholders in docs/README or root README.md describing local dev expectations

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T007 Setup PostgreSQL connection configuration in backend/src/core/config.py
- [x] T008 Setup SQLAlchemy engine/session and dependency wiring in backend/src/core/db.py
- [x] T009 Setup Alembic configuration and first migration in backend/alembic/ (or backend/migrations/)
- [x] T010 Define base error model + error codes in backend/src/core/errors.py
- [x] T011 Setup structured logging + request correlation ID in backend/src/core/logging.py
- [x] T012 Setup FastAPI app factory and health endpoint in backend/src/api/main.py
- [x] T013 Setup API router registration in backend/src/api/routers/__init__.py
- [x] T014 Setup auth scaffolding (password hashing, JWT settings) in backend/src/core/security.py
- [x] T015 Setup RBAC primitives (roles + guard dependency) in backend/src/core/rbac.py
- [x] T016 Setup file storage abstraction for uploads/generated docs in backend/src/core/storage.py
- [x] T017 Setup background scheduler harness in backend/src/jobs/scheduler.py
- [x] T018 [P] Create shared frontend API client wrapper in frontend/src/services/apiClient.ts
- [x] T019 [P] Create shared frontend routing/layout skeleton in frontend/src/app/App.tsx and frontend/src/routes/routes.tsx

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Staff can securely operate rentals with roles (Priority: P1) 🎯 MVP

**Goal**: Staff authentication + RBAC + audit attribution for key actions.

**Independent Test**: Create users for each role, log in, and verify protected endpoints are accessible/blocked correctly.

### Tests for User Story 1

- [x] T020 [P] [US1] Add auth integration tests for login/refresh in backend/tests/integration/test_auth.py
- [x] T021 [P] [US1] Add RBAC guard tests in backend/tests/unit/test_rbac.py

### Implementation for User Story 1

- [x] T022 [P] [US1] Create SQLAlchemy StaffUser model in backend/src/models/staff_user.py
- [x] T023 [P] [US1] Create SQLAlchemy AuditEvent model in backend/src/models/audit_event.py
- [x] T024 [US1] Implement auth schemas in backend/src/schemas/auth.py
- [x] T025 [US1] Implement auth router endpoints in backend/src/api/routers/auth.py
- [x] T026 [US1] Implement /me endpoint in backend/src/api/routers/me.py
- [x] T027 [US1] Implement AuditEvent write helper in backend/src/services/audit_service.py
- [x] T028 [US1] Add RBAC guards to protected routes via dependencies in backend/src/api/deps/auth.py
- [x] T029 [P] [US1] Build login page UI in frontend/src/pages/LoginPage.tsx
- [x] T030 [P] [US1] Build auth state + token storage service in frontend/src/services/auth.ts
- [x] T031 [US1] Add route guards (role-based) in frontend/src/routes/guards.tsx

**Checkpoint**: Staff login + RBAC works end-to-end.

---

## Phase 4: User Story 2 - Create and manage standard rental agreements end-to-end (Priority: P1)

**Goal**: Standard agreement creation + detail view + availability enforcement + ledger/balance computation + close.

**Independent Test**: Create customer + vehicle, create standard agreement, post payment, view balance, close agreement.

### Tests for User Story 2

- [x] T032 [P] [US2] Add availability overlap unit tests in backend/tests/unit/test_availability.py
- [x] T033 [P] [US2] Add ledger balance computation unit tests in backend/tests/unit/test_ledger.py
- [x] T034 [P] [US2] Add agreement create/close integration test in backend/tests/integration/test_agreements_standard.py

### Implementation for User Story 2

- [x] T035 [P] [US2] Create SQLAlchemy Customer model in backend/src/models/customer.py
- [x] T036 [P] [US2] Create SQLAlchemy Vehicle model in backend/src/models/vehicle.py
- [x] T037 [P] [US2] Create SQLAlchemy Agreement model in backend/src/models/agreement.py
- [x] T038 [P] [US2] Create SQLAlchemy AgreementVehicleSegment model in backend/src/models/agreement_vehicle_segment.py
- [x] T039 [P] [US2] Create SQLAlchemy LedgerEntry model in backend/src/models/ledger_entry.py
- [x] T040 [US2] Implement availability query repository in backend/src/repositories/availability_repository.py
- [x] T041 [US2] Implement agreement repository in backend/src/repositories/agreement_repository.py
- [x] T042 [US2] Implement agreement service (create, close) in backend/src/services/agreement_service.py
- [x] T043 [US2] Implement billing calculation (24h blocks, round up) in backend/src/services/billing_service.py
- [x] T044 [US2] Implement ledger append-only operations in backend/src/services/ledger_service.py
- [x] T045 [US2] Implement agreements router in backend/src/api/routers/agreements.py
- [x] T046 [US2] Implement availability router in backend/src/api/routers/availability.py
- [x] T047 [P] [US2] Build agreements list page UI in frontend/src/pages/AgreementsPage.tsx
- [x] T048 [P] [US2] Build agreement create form UI in frontend/src/pages/AgreementCreatePage.tsx (agreement type selector, driver selection for driver agreements, collateral person selection required, advance payment)
- [x] T049 [P] [US2] Build agreement detail tabs UI in frontend/src/pages/AgreementDetailPage.tsx
- [x] T050 [US2] Implement agreement API calls in frontend/src/services/agreements.ts (agreement_type, driver_id, collateral_person_id, advance_payment)
- [x] T051 [US2] Implement ledger UI table component in frontend/src/components/ledger/LedgerTable.tsx

**Checkpoint**: Standard agreement can be created, viewed, paid, and closed with correct balance and no double-booking.

---

## Phase 5: User Story 3 - Manage master data (customers, vendors, fleet) with fast lookup (Priority: P2)

**Goal**: CRUD + search for customers/vendors/vehicles and “lookup modal” selection UX.

**Independent Test**: Create records, search quickly, and select via lookup modal in agreement forms.

### Implementation for User Story 3

- [x] T052 [P] [US3] Create SQLAlchemy Vendor model in backend/src/models/vendor.py
- [x] T053 [US3] Implement customers router in backend/src/api/routers/customers.py
- [x] T054 [US3] Implement vendors router in backend/src/api/routers/vendors.py
- [x] T055 [US3] Implement vehicles router (CRUD + status changes) in backend/src/api/routers/vehicles.py
- [ ] T056 [US3] Implement vehicle photo upload endpoint in backend/src/api/routers/vehicle_photos.py
- [x] T057 [P] [US3] Build customers page UI in frontend/src/pages/CustomersPage.tsx
- [x] T058 [P] [US3] Build vendors page UI in frontend/src/pages/VendorsPage.tsx
- [x] T059 [P] [US3] Build vehicles page UI in frontend/src/pages/VehiclesPage.tsx
- [x] T060 [P] [US3] Build lookup modal component in frontend/src/components/lookup/LookupModal.tsx
- [x] T061 [US3] Integrate lookup modals into agreement create UI in frontend/src/pages/AgreementCreatePage.tsx
- [x] T061A [P] [US3] Create Driver model + schemas + API router in backend/src/models/driver.py, backend/src/schemas/driver.py, backend/src/api/routers/drivers.py
- [x] T061B [P] [US3] Create CollateralPerson model + schemas + API router in backend/src/models/collateral_person.py, backend/src/schemas/collateral_person.py, backend/src/api/routers/collaterals.py
- [x] T061C [US3] Add drivers/collaterals router registration in backend/src/api/routers/__init__.py
- [x] T061D [US3] Add customer->collateral relationship in backend/src/models/customer.py
- [x] T061E [US3] Add driver and collateral management UI + services in frontend/src/pages/DriversPage.tsx, frontend/src/pages/CollateralsPage.tsx, frontend/src/services/drivers.ts, frontend/src/services/collaterals.ts
- [x] T061F [US3] Add routes and navigation for Drivers and Collaterals in frontend/src/app/App.tsx and frontend/src/app/Layout.tsx

**Checkpoint**: Master data managed from UI; lookup modals speed up agreement creation.

---

## Phase 6: User Story 4 - Wedding and vendor wedding supply agreements (Priority: P2)

**Goal**: Wedding agreement with multi-vehicle lines, totals + deposit, and vendor supply agreements with optional linkage.

**Independent Test**: Create wedding agreement with two vehicles; enforce availability; vehicles reserved ahead, rented only during event window.

### Tests for User Story 4

- [ ] T062 [P] [US4] Add wedding multi-vehicle availability tests in backend/tests/unit/test_wedding_availability.py
- [ ] T063 [P] [US4] Add wedding totals/deposit tests in backend/tests/unit/test_wedding_pricing.py

### Implementation for User Story 4

- [x] T064 [US4] Implement wedding agreement service in backend/src/services/wedding_agreement_service.py
- [x] T065 [US4] Extend agreements router to support wedding types in backend/src/api/routers/agreements.py
- [x] T066 [P] [US4] Build wedding agreements page UI in frontend/src/pages/WeddingAgreementsPage.tsx
- [x] T067 [P] [US4] Build wedding agreement form with multi-vehicle table in frontend/src/components/wedding/WeddingVehicleTable.tsx
- [x] T068 [P] [US4] Build vendor wedding supply agreement page UI in frontend/src/pages/VendorWeddingAgreementsPage.tsx

**Checkpoint**: Wedding workflows work and enforce time-based availability correctly.

---

## Phase 7: User Story 5 - Payments, inspections, and printing (Priority: P2)

**Goal**: Ledger payments/adjustments/reversals, inspections module with templates, and document generation/printing.

**Independent Test**: Post payment and adjustment, verify balance; complete inspection; generate and download PDF.

### Tests for User Story 5

- [ ] T069 [P] [US5] Add ledger append-only enforcement tests in backend/tests/unit/test_ledger_append_only.py
- [ ] T070 [P] [US5] Add printing generation happy-path integration test in backend/tests/integration/test_printing.py

### Implementation for User Story 5

- [x] T071 [US5] Implement ledger endpoints for posting entries in backend/src/api/routers/ledger.py
- [x] T072 [US5] Implement inspection template models in backend/src/models/inspection_template.py
- [x] T073 [US5] Implement inspection models in backend/src/models/inspection.py
- [x] T074 [US5] Implement inspections router in backend/src/api/routers/inspections.py
- [x] T075 [US5] Implement printing service (DOCX fill + PDF conversion) in backend/src/services/printing_service.py
- [x] T076 [US5] Implement documents router in backend/src/api/routers/documents.py
- [x] T077 [P] [US5] Build payments/ledger page UI in frontend/src/pages/LedgerPage.tsx
- [x] T078 [P] [US5] Build inspections templates page UI in frontend/src/pages/InspectionTemplatesPage.tsx
- [x] T079 [P] [US5] Build inspection create UI in frontend/src/pages/InspectionCreatePage.tsx
- [x] T080 [P] [US5] Build print/download actions UI in frontend/src/components/printing/PrintButton.tsx
- [x] T081 [US5] Add i18next language toggle to layout header in frontend/src/app/Layout.tsx

**Checkpoint**: Payments and inspections are auditable; printing produces correct documents.

---

## Phase 8: User Story 6 - Booking requests + Telegram notifications + dashboards/reports (Priority: P3)

**Goal**: Booking requests lifecycle, Telegram webhook + admin commands, scheduler reminders, dashboards and reports.

**Independent Test**: Create booking request, convert to agreement, see due returns/overdue and run a Telegram summary.

### Tests for User Story 6

- [ ] T082 [P] [US6] Add booking request conversion integration test in backend/tests/integration/test_booking_requests.py

### Implementation for User Story 6

- [ ] T083 [US6] Create BookingRequest model in backend/src/models/booking_request.py
- [ ] T084 [US6] Implement booking requests router in backend/src/api/routers/booking_requests.py
- [ ] T085 [US6] Implement Telegram webhook router in backend/src/api/routers/integrations_telegram.py
- [ ] T086 [US6] Implement Telegram message sending client in backend/src/services/telegram_service.py
- [ ] T087 [US6] Implement scheduler reminder jobs in backend/src/jobs/reminders.py
- [ ] T088 [P] [US6] Build booking requests page UI in frontend/src/pages/BookingRequestsPage.tsx
- [ ] T089 [P] [US6] Build dashboard page UI in frontend/src/pages/DashboardPage.tsx
- [ ] T090 [P] [US6] Build reports page UI (filters + exports placeholder) in frontend/src/pages/ReportsPage.tsx

**Checkpoint**: Requests can be converted, and ops team has dashboards + notifications.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T091 [P] Add OpenAPI auth/security scheme documentation in specs/001-car-rental-e2e/contracts/openapi.yaml
- [ ] T092 Add consistent error codes mapping to UI notifications in backend/src/core/errors.py and frontend/src/services/errorMapper.ts
- [ ] T093 [P] Add pagination patterns for list endpoints in backend/src/api/routers/*.py
- [ ] T094 [P] Add pagination UI helpers for tables in frontend/src/components/tables/PaginatedTable.tsx
- [ ] T095 Add audit event coverage for all critical actions in backend/src/services/audit_service.py
- [ ] T096 Add PII log redaction checks in backend/src/core/logging.py
- [ ] T097 Run quickstart.md validation and update docs in specs/001-car-rental-e2e/quickstart.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Phase 9)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - enables secure access/audit for all other stories
- **User Story 2 (P1)**: Can start after Foundational; depends on basic customer/vehicle existence
- **User Story 3 (P2)**: Can start after Foundational; improves UX, but can be partially built alongside US2
- **User Story 4 (P2)**: Depends on US2 availability + agreement primitives
- **User Story 5 (P2)**: Depends on US2 agreement primitives + ledger model
- **User Story 6 (P3)**: Depends on US2/US3 for conversion and operational reporting

---

## Parallel Example: User Story 2

```bash
Task: "Create SQLAlchemy Agreement model in backend/src/models/agreement.py"
Task: "Create SQLAlchemy AgreementVehicleSegment model in backend/src/models/agreement_vehicle_segment.py"
Task: "Create SQLAlchemy LedgerEntry model in backend/src/models/ledger_entry.py"
Task: "Build agreements list page UI in frontend/src/pages/AgreementsPage.tsx"
Task: "Build agreement detail tabs UI in frontend/src/pages/AgreementDetailPage.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 + minimal User Story 2)

1. Complete Phase 1 + Phase 2
2. Complete Phase 3 (US1)
3. Implement a minimal slice of Phase 4 (US2): create standard agreement + availability check + view detail
4. **STOP and VALIDATE**: confirm RBAC + audit attribution + no double-booking

### Incremental Delivery

- Add US3 (master data UI) to speed workflows
- Add US2 full lifecycle (close + ledger)
- Add US4/US5 then US6

## Notes

- Tests are included for availability and ledger invariants because they are constitution-critical.
- File paths reflect the planned split: `backend/src/...` and `frontend/src/...`.

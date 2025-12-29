# Feature Specification: End-to-End Car Rental Management System
 
 **Feature Branch**: `001-car-rental-e2e`  
 **Created**: 2025-12-29  
 **Status**: Draft  
 **Input**: Replace legacy desktop system with a complete car rental management app (RBAC, bilingual UI/prints,
 master data, fleet, agreements, payments, inspections, printing, booking requests + Telegram notifications,
 dashboards/reports, and audit trail).

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.
  
  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

 ### User Story 1 - Staff can securely operate rentals with roles (Priority: P1)
 
 Staff log in and perform daily operations according to their role (Admin, Sales/Front Desk, Fleet Manager,
 Inspector, Accountant). The system records who performed key actions.
 
 **Why this priority**: No business flow is trustworthy without access control and auditability.
 
 **Independent Test**: Create a staff account per role, log in, and verify that restricted actions are blocked
 and auditable.
 
 **Acceptance Scenarios**:
 
 1. **Given** a Sales user is logged in, **When** they attempt to edit rate settings,
    **Then** the system denies the action and records an authorization event.
 2. **Given** an Admin user creates a new staff account and assigns a role,
    **When** the staff member logs in, **Then** only role-permitted screens/actions are available.
 3. **Given** an agreement is created/extended/vehicle-replaced/closed,
    **When** viewing the agreement history, **Then** each action is attributed to a specific staff user.

---

 ### User Story 2 - Create and manage standard rental agreements end-to-end (Priority: P1)
 
 Staff create standard customer rental agreements by selecting an existing customer and an available vehicle,
 setting start/end date/time and daily rate. The system computes charges and maintains agreement detail
 including vehicle history, payment history, and balance.
 
 Billing rule: 1 day = 24 hours. Charged days are computed from the 24-hour difference between start and end
 (partial days are charged as a full day).
 
 Staff can:
 - Extend an active agreement (renewal/extension)
 - Replace a vehicle mid-agreement while preserving vehicle history segments
 - Close/return an agreement and release vehicle status appropriately
 
 **Why this priority**: Standard rentals are the core revenue workflow.
 
 **Independent Test**: Create one customer + one vehicle, create an agreement, extend it, replace the vehicle,
 post payments, and close it while verifying availability and balances.
 
 **Acceptance Scenarios**:
 
 1. **Given** a vehicle is available for a date/time range, **When** staff create a standard agreement,
    **Then** the agreement is saved, expected charges are computed, and the vehicle becomes reserved/rented
    per lifecycle rules.
 2. **Given** an agreement is active, **When** staff extend the end date/time,
    **Then** the system records an extension history entry and updates charges and balance.
 3. **Given** an agreement is active, **When** staff replace the vehicle effective a date/time,
    **Then** the prior vehicle segment closes at that time, a new vehicle segment begins, and both vehicles’
    statuses update correctly.
 4. **Given** the agreement end date/time has passed, **When** staff view the agreement list,
    **Then** the agreement is flagged as overdue/expired until closed.

---

 ### User Story 3 - Manage master data (customers, vendors, fleet) with fast lookup (Priority: P2)
 
 Staff maintain customer and vendor records with structured addresses. Staff maintain fleet records including
 vehicle identifiers, characteristics, ownership, photos, expiry dates, operational status, and history.
 Agreement forms support quick lookup popups/modals for selecting a customer/vendor and selecting an
 available vehicle.
 
 **Why this priority**: Agreements depend on accurate parties and fleet data.
 
 **Independent Test**: Create customers and vendors, search them via quick lookup, create vehicles with
 photos/expiry dates/status, and verify the vehicle picker excludes unavailable vehicles for a time range.
 
 **Acceptance Scenarios**:
 
 1. **Given** many customers/vendors exist, **When** staff search by name/phone,
    **Then** results appear quickly and selecting an item populates agreement fields.
 2. **Given** a vehicle is reserved/rented for a period, **When** staff open a vehicle picker for an
    overlapping period, **Then** that vehicle is not selectable.
 3. **Given** insurance expiry dates, **When** staff filter/report vehicles expiring soon,
    **Then** the results match configured “soon” criteria.

---

 ### User Story 4 - Wedding and vendor wedding supply agreements (Priority: P2)
 
 Staff create wedding agreements with event start/end date/time and add multiple vehicles under one
 agreement, each with its own price. The system totals the amount and calculates a deposit requirement
 (default rule: 50% deposit, configurable later).
 
 Vehicle status expectation for wedding agreements: vehicles MUST be reserved ahead of the event, and MUST
 be treated as rented ONLY for the event date/time window itself.
 
 Staff can also create vendor wedding supply agreements (vendor provides vehicles). The system may link a
 vendor supply agreement to a customer wedding agreement for reconciliation.
 
 **Why this priority**: Wedding/event workflows are a core business use case and require multi-vehicle
 scheduling.
 
 **Independent Test**: Create a wedding agreement with two vehicles, verify totals and deposit required, and
 ensure availability rules prevent double-booking.
 
 **Acceptance Scenarios**:
 
 1. **Given** multiple vehicles are selected with per-vehicle prices, **When** the wedding agreement is saved,
    **Then** the total amount and deposit-required amounts are computed and displayed.
 2. **Given** an event agreement reserves vehicles, **When** another agreement attempts to book the same
    vehicles for overlapping times, **Then** the system blocks it.
 3. **Given** a vendor supply agreement is linked to a customer wedding agreement, **When** staff view the
    wedding agreement, **Then** linked vendor obligations are visible.
 4. **Given** a wedding agreement exists for a future date, **When** staff view fleet status before the event,
    **Then** the vehicles appear as reserved (not rented).
 5. **Given** the event window begins, **When** staff view fleet status for that date/time window,
    **Then** the vehicles appear as rented for that window.
 
 ---
 
 ### User Story 5 - Payments, inspections, and printing (Priority: P2)
 
 Staff post payments (cash, bank transfer, etc.) against agreements with reference numbers where applicable.
 The system maintains financial history entries for charges, payments, adjustments, and reversals and computes
 totals and balance.
 
 Staff create inspections using bilingual checklist templates, tied to a vehicle and optionally to an agreement.
 Inspections can be skipped (recording who/why) and are printable.
 
 Staff print/download official documents (agreements and inspection forms) and printed outputs reflect the
 selected language (English/Amharic) where applicable.
 
 **Why this priority**: Finance control, dispute reduction, and printing are essential daily operations.
 
 **Independent Test**: Post multiple payments/adjustments and verify balance; complete and print an
 inspection; print an agreement in both languages.
 
 **Acceptance Scenarios**:
 
 1. **Given** a payment is posted to an agreement, **When** staff view agreement details,
    **Then** payment history shows date/reference/method/amount and the balance updates correctly.
 2. **Given** an inspector completes an inspection, **When** printing the inspection,
    **Then** the printout includes checklist results, vehicle/agreement identifiers, and inspector identity.
 3. **Given** language is toggled, **When** printing a bilingual-supported document,
    **Then** printed labels and key text reflect the selected language.
 
 ---
 
 ### User Story 6 - Booking requests + Telegram notifications + dashboards/reports (Priority: P3)
 
 The system accepts booking requests (manual entry and future integrations) and staff can convert requests into
 agreements without re-entering customer/booking details.
 
 The system provides operational alerts and summaries (due returns, overdue rentals, insurance expiring soon,
 outstanding balances) and produces dashboards and reports for daily operations.
 
 **Why this priority**: Improves lead conversion and operational awareness.
 
 **Independent Test**: Create a booking request, convert it into an agreement, and verify a due/overdue item
 appears in dashboards/alerts.
 
 **Acceptance Scenarios**:
 
 1. **Given** a booking request is created, **When** staff convert it to an agreement,
    **Then** key data (name/phone/dates/vehicle preference) carries over and the request status updates.
 2. **Given** an agreement is due today, **When** viewing the dashboard,
    **Then** it appears in today’s returns and can be filtered.
 3. **Given** scheduled reminders are enabled, **When** an agreement becomes overdue,
    **Then** the system can produce an overdue summary for staff/admin channels.

### Edge Cases

 - What happens when two staff try to book the same vehicle for overlapping time windows?
 - What happens when an agreement duration is not a whole multiple of 24 hours (partial day billing)?
 - What happens when an agreement is extended into a period where the assigned vehicle is already reserved
   (should be blocked unless vehicle replacement occurs)?
 - What happens if a vehicle is replaced effective a date/time that is before the agreement start or after the
   current end (should be rejected)?
 - What happens if payment posting is submitted twice (duplicate capture) or a refund is submitted twice
   (idempotency)?
 - What happens if a user without the required role tries to extend/replace/close/print an agreement?
 - What happens if the selected UI language changes after an agreement is created (view and printing should
   still pull correct data and render in selected language)?
 - What data is sensitive (license number, phone numbers, addresses) and what MUST NOT be logged?

## Requirements *(mandatory)*

### Functional Requirements

 - **FR-001**: System MUST support staff authentication using username/password and MUST allow staff to log in and log out.
 - **FR-002**: System MUST support role-based access control with at least these roles: Admin, Sales/Front Desk, Fleet Manager, Inspector, Accountant.
 - **FR-003**: System MUST record an audit trail for key actions including creating/editing agreements, extending, replacing vehicles, posting payments, adjustments/reversals, closing, and printing.
 - **FR-004**: System MUST support bilingual UI (English/Amharic) via a language toggle.
 - **FR-005**: The selected language MUST affect printable outputs where applicable.
 - **FR-006**: System MUST allow staff to create, update, search, and select customers with identity and contact details (names, phone numbers, optional driver’s license number).
 - **FR-007**: System MUST store structured addresses for customers and vendors (city, subcity, woreda, kebele, house number, notes).
 - **FR-008**: System MUST allow staff to create, update, search, and select vendors (company name, contact person, phone numbers, address).
 - **FR-009**: System MUST store fleet/vehicle records including plate code/region and plate number, model, service type, fuel type, color, condition, ownership (company/vendor), insurance expiry date, and vehicle photos (front/left/right/back).
 - **FR-010**: System MUST maintain a vehicle operational status model including at least: Available, Reserved, Rented, Maintenance, Inactive.
 - **FR-011**: System MUST enforce availability rules to prevent double booking across all agreement types and across vehicle replacement segments.
 - **FR-012**: System MUST provide vehicle pickers that only show vehicles that are available for the selected time period.
 - **FR-013**: System MUST support standard rental agreements with start/end date-time, daily rate, computed total days, and computed expected charges.
 - **FR-013A**: The system MUST compute rental days in 24-hour blocks: 1 day = 24 hours; any partial day MUST be charged as a full day.
 - **FR-014**: System MUST support agreement lifecycle operations: extend/renew, replace vehicle mid-agreement with segment history, and close/return.
 - **FR-015**: System MUST maintain agreement detail views showing party info, vehicle assignment history, payment history, and computed balance.
 - **FR-016**: System MUST support wedding agreements with multi-vehicle selection and per-vehicle pricing, and MUST compute totals and deposit-required amount (default 50%).
 - **FR-016A**: For wedding agreements, vehicles MUST be treated as rented ONLY for the event date/time window; before the event window they MUST not be marked as rented (they may be reserved/scheduled).
 - **FR-017**: System MUST support vendor wedding supply agreements with multi-vehicle pricing and scheduling, and MAY link a vendor supply agreement to a customer wedding agreement.
 - **FR-018**: System MUST support financial history per agreement including charges, payments, adjustments (discounts/penalties), and reversals (corrections).
 - **FR-019**: Payment entry MUST capture method (e.g., cash, bank transfer), optional reference number, posted timestamp, and posting staff user.
 - **FR-020**: The system MUST compute totals including total charges, total paid, deposit required, deposit paid, and current balance.
 - **FR-021**: System MUST support inspection checklist templates with bilingual item descriptions.
 - **FR-022**: System MUST allow creating inspections tied to vehicles and optionally to agreements with item statuses (OK, NOT OK, NA) and remarks.
 - **FR-023**: System MUST support skipping an inspection as “not necessary” while recording who skipped and why.
 - **FR-024**: System MUST support printing/downloading official documents: standard rental agreement, wedding agreement, vendor wedding supply agreement, and inspection printouts.
 - **FR-025**: System MUST support booking requests with fields (customer name, phone, desired start/end date-time, vehicle preference) and statuses (new, confirmed, rejected, converted).
 - **FR-026**: Staff MUST be able to convert booking requests into agreements without re-entering core fields.
 - **FR-027**: System MUST support operational dashboards for today’s returns, overdue agreements, vehicles rented/reserved, outstanding payments, and insurance expiries.
 - **FR-028**: System MUST support reports with date range filters for revenue, outstanding balances, overdue returns, vehicle utilization, vendor obligations, and inspection history.
 - **FR-029**: System MUST NOT log personally identifiable information (PII) in application logs.
 - **FR-030**: Data retention MUST be configurable; default retention is 7 years for agreements and financial records.

### Key Entities *(include if feature involves data)*

 - **StaffUser**: identity, credentials, role(s), active/inactive, audit attribution.
 - **Role/Permission**: role definitions and permitted actions.
 - **Customer**: name(s), phone numbers, optional driver’s license number, address.
 - **Vendor**: company name, contact person, phone numbers, address.
 - **Vehicle**: plate code/region, plate number, attributes, ownership, expiry dates, photos, operational status.
 - **VehicleStatusEvent**: timestamped record of status changes (optional but supports traceability).
 - **Agreement**: common agreement fields (type, parties, start/end date-time, status, totals).
 - **AgreementVehicleSegment**: vehicle assignment segments (initial, replacement segments) with effective start/end date-time.
 - **AgreementCharge**: computed/manual charges, fees, penalties.
 - **PaymentTransaction**: method, reference, amount, posted by, posted at.
 - **Adjustment/Reversal**: corrections to charges/payments with audit metadata.
 - **InspectionTemplate**: bilingual checklist items.
 - **Inspection**: inspection event for vehicle (+ optional agreement), results, remarks, skipped flag + reason.
 - **PrintableDocument**: agreement/inspection print outputs and metadata.
 - **BookingRequest**: lead details, desired schedule, preference, status, conversion linkage.
 - **NotificationRule**: scheduled/on-demand summaries and alert settings.

## Success Criteria *(mandatory)*

<!--
  ACTION REQUIRED: Define measurable success criteria.
  These must be technology-agnostic and measurable.
-->

### Measurable Outcomes

 - **SC-001**: A staff user can create a standard rental agreement (customer + vehicle + dates + rate) in under 2 minutes.
 - **SC-002**: Double-booking prevention is enforced: for any overlapping time window, the system blocks selecting a non-available vehicle 100% of the time.
 - **SC-003**: For a closed agreement, computed balance equals total charges minus total paid (including adjustments/reversals) with no manual spreadsheet correction required.
 - **SC-004**: For each key action (create agreement, extend, replace vehicle, post payment, close, print), the system can display the actor and timestamp.
 - **SC-005**: Staff can generate and print/download an agreement or inspection document within 30 seconds of request.
 - **SC-006**: Daily dashboard reflects operational reality: today’s returns and overdue agreements match the underlying agreements for the selected date.

# Data Model: End-to-End Car Rental Management System

This is a domain-first model (technology-agnostic). Field names are indicative.

## Core Identity & Access

### StaffUser
- id
- username (unique)
- password_hash
- full_name
- role (enum: ADMIN, SALES, FLEET, INSPECTOR, ACCOUNTANT)
- is_active
- created_at

### AuditEvent
- id
- actor_user_id (nullable for system jobs)
- action_type (e.g., AGREEMENT_CREATE, AGREEMENT_EXTEND, VEHICLE_REPLACE, PAYMENT_POST, DOCUMENT_PRINT)
- entity_type
- entity_id
- metadata (structured)
- occurred_at

## Parties

### Address
- city
- subcity
- woreda
- kebele
- house_number
- notes

### Customer
- id
- full_name
- phone_primary
- phone_secondary (optional)
- driver_license_no (optional)
- address (structured)
- is_active
- created_at

### Vendor
- id
- company_name
- contact_person
- phone_primary
- phone_secondary (optional)
- address (structured)
- is_active
- created_at

## Fleet

### Vehicle
- id
- plate_region_code
- plate_number (unique with region)
- model
- service_type
- fuel_type
- color
- condition
- ownership_type (COMPANY_OWNED | VENDOR_OWNED)
- vendor_id (nullable)
- insurance_expiry_date
- status (AVAILABLE | RESERVED | RENTED | MAINTENANCE | INACTIVE)
- created_at

### VehiclePhoto
- id
- vehicle_id
- kind (FRONT | LEFT | RIGHT | BACK)
- file_url/path
- uploaded_at

### VehicleStatusHistory (optional but recommended)
- id
- vehicle_id
- old_status
- new_status
- reason
- changed_by_user_id
- changed_at

## Agreements

### Agreement
- id
- agreement_no (unique, human-friendly)
- agreement_type (STANDARD | WEDDING_CUSTOMER | WEDDING_VENDOR)
- status (DRAFT | ACTIVE | CLOSED | OVERDUE | CANCELLED)
- customer_id (nullable; required for customer agreements)
- vendor_id (nullable; required for vendor supply agreements)
- start_datetime
- end_datetime
- daily_rate (for STANDARD)
- deposit_percent (for WEDDING*, default 50)
- notes
- created_by_user_id
- created_at

### AgreementVehicleSegment
Represents vehicle assignment blocks.
- id
- agreement_id
- vehicle_id
- segment_type (INITIAL | REPLACEMENT)
- start_datetime
- end_datetime (nullable if currently active)
- price (for wedding per-vehicle pricing)
- created_by_user_id
- created_at

Constraints:
- No overlapping segments for the same vehicle across all agreements (availability rule).
- For STANDARD agreement, segments should cover the active rental period without gaps (unless explicitly allowed).

### AgreementExtension
- id
- agreement_id
- previous_end_datetime
- new_end_datetime
- computed_added_days
- computed_added_amount
- extended_by_user_id
- extended_at

## Finance (Append-only)

### LedgerEntry
- id
- agreement_id
- entry_type (CHARGE | PAYMENT | ADJUSTMENT | REVERSAL)
- amount (signed)
- method (for payments; optional)
- reference_no (optional)
- receipt_no (recommended unique)
- description
- created_by_user_id
- created_at

Derived values (computed, not stored as truth):
- total_charges
- total_paid
- deposit_required
- deposit_paid
- balance

## Inspections

### InspectionTemplate
- id
- name
- is_active

### InspectionTemplateItem
- id
- template_id
- code
- description_en
- description_am
- display_order

### Inspection
- id
- inspection_type (DELIVER_TO_CUSTOMER | RECEIVE_FROM_CUSTOMER | RECEIVE_FROM_VENDOR | REGULAR)
- vehicle_id
- agreement_id (optional)
- status (COMPLETED | SKIPPED)
- skipped_reason (required if skipped)
- created_by_user_id
- created_at

### InspectionResult
- id
- inspection_id
- template_item_id
- status (OK | NOT_OK | NA)
- remarks

## Booking Requests

### BookingRequest
- id
- customer_name
- phone
- desired_start_datetime
- desired_end_datetime
- vehicle_preference (free text)
- status (NEW | CONFIRMED | REJECTED | CONVERTED)
- converted_agreement_id (optional)
- source (MANUAL | TELEGRAM | WEB)
- created_at

## Documents

### GeneratedDocument
- id
- document_type (STANDARD_AGREEMENT | WEDDING_AGREEMENT | VENDOR_WEDDING_AGREEMENT | INSPECTION_REPORT)
- agreement_id (optional)
- inspection_id (optional)
- language (EN | AM)
- template_version
- file_url/path
- generated_by_user_id
- generated_at

## Key State Transitions

- Vehicle.status
  - AVAILABLE → RESERVED (booking created)
  - RESERVED → RENTED (checkout / event window start)
  - RENTED → AVAILABLE (check-in/close) OR RENTED → MAINTENANCE

- Agreement.status
  - DRAFT → ACTIVE → CLOSED
  - ACTIVE → OVERDUE (time-based) → CLOSED

## Rules to enforce (non-negotiable)

- Double-booking prevention (vehicle availability across time windows, including segments).
- 1 day = 24 hours billing; partial day charged as full day.
- Ledger is append-only; corrections are new entries (adjustment/reversal), no destructive edits.
- RBAC enforced on all privileged operations.
- PII not logged.

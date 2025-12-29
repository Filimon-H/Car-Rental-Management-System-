<!--
 Sync Impact Report
 - Version change: N/A (template) → 1.0.0
 - Modified principles: N/A (template) → defined 5 principles
 - Added sections: Core Principles content, Security & Compliance, Operating Workflow & Quality Gates
 - Removed sections: none
 - Templates requiring updates: CarRental/.specify/templates/plan-template.md (⚠ pending), CarRental/.specify/templates/spec-template.md (⚠ pending), CarRental/.specify/templates/tasks-template.md (⚠ pending)
 - Deferred TODOs: TODO(RATIFICATION_DATE): original adoption date unknown
 -->
 # Car Rental Management System Constitution
 <!-- Governance rules for building and operating a car-rental business management system. -->

## Core Principles

 ### Customer & Revenue Protection (NON-NEGOTIABLE)
 The system MUST prevent revenue loss and customer harm by enforcing:
 - Accurate availability (no double-booking for the same vehicle/time).
 - Correct pricing and fees (rate plan + extras + taxes/fees) with auditability.
 - Clear contract lifecycle: quote → reservation → checkout → active rental → check-in → closed.

 ### Fleet Integrity & Safety
 The system MUST treat vehicles as safety-critical assets:
 - Vehicle status MUST be explicit and mutually exclusive (e.g., Available, Reserved, Rented, Maintenance, Retired).
 - Maintenance blocks MUST prevent checkout and MUST be traceable to work orders.
 - Check-out and check-in MUST record condition (fuel/charge, mileage, damages, photos if supported).

 ### Financial Accuracy & Audit Trail (NON-NEGOTIABLE)
 Any money movement MUST be correct, traceable, and reversible where business rules allow:
 - Every invoice, payment, refund, adjustment MUST have an immutable audit entry.
 - Changes to pricing, discounts, fees, and taxes MUST record who/when/why.
 - Idempotency MUST be enforced for payment capture and refunds.

 ### Data Quality, Privacy, and Least Privilege
 Customer and staff data MUST be protected:
 - Role-based access control MUST exist for all privileged operations.
 - Sensitive fields MUST be minimized and protected (e.g., license/passport, payment tokens).
 - Personally identifiable information MUST NOT be logged.
 - Data retention rules MUST be explicit per entity (TODO if unknown in a feature spec).

 ### Operational Resilience & Traceability
 The system MUST support day-to-day operations under pressure:
 - Key workflows MUST be observable (reservation, checkout, check-in, billing, payments, fleet status changes).
 - Errors MUST be actionable: include a stable error code and a user-safe message.
 - Critical actions MUST be logged with correlation (request/job ID) and actor identity.

 ## Security & Compliance
 
 - Authentication MUST be required for staff actions.
 - Authorization MUST be role-based and deny-by-default.
 - Secrets (API keys, DB creds) MUST NOT be committed to the repository.
 - Payment data handling MUST be tokenized; raw card data MUST NOT be stored.
 - Any external integrations (payment gateway, email/SMS) MUST have retry + failure handling.

 ## Operating Workflow & Quality Gates
 
 - Every feature spec MUST define acceptance scenarios for the primary user journeys.
 - Any change that touches reservations, checkout/check-in, pricing, or payments MUST include explicit edge cases.
 - Database migrations MUST be reversible or have a documented rollback plan.
 - All changes that affect money or availability MUST include tests (unit and/or integration) proving correctness.

 ## Governance
 
 - This constitution supersedes local team conventions and feature documents.
 - Amendments require:
   - A written change description and rationale
   - Impact assessment (which specs/plans/tasks/templates change)
   - Migration/rollout plan if behavior changes
 - Semantic versioning:
   - MAJOR: breaking governance or removed/redefined principles
   - MINOR: new principle/section or materially expanded requirements
   - PATCH: clarifications and wording only
 - Reviews MUST include a Constitution Check for compliance.

 **Version**: 1.0.0 | **Ratified**: TODO(RATIFICATION_DATE): original adoption date unknown | **Last Amended**: 2025-12-29

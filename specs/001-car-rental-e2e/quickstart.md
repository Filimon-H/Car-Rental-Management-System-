# Quickstart: End-to-End Car Rental Management System

This quickstart describes the intended developer workflow for the planned architecture.

## Prerequisites

- Python 3.11
- Node.js (LTS)
- PostgreSQL

## Local Development (Target)

### 1) Database

- Run PostgreSQL locally.
- Create a database for development.

### 2) Backend API (FastAPI)

- Install dependencies.
- Configure environment variables:
  - DATABASE_URL
  - JWT_SECRET
  - FILE_STORAGE_PATH
- Run migrations.
- Start the API server.

### 3) Frontend Admin (React)

- Install dependencies.
- Configure environment variables:
  - API_BASE_URL
- Start the dev server.

## File Storage (MVP)

- Vehicle photos stored under `uploads/vehicles/`.
- Generated documents stored under `generated_docs/`.

## Printing

- Templates stored under backend `templates/`.
- Generated documents should be stored and served via download endpoints.

## Background Jobs

- A scheduler runs periodic jobs:
  - Due returns
  - Overdue agreements
  - Insurance expiry reminders
  - Outstanding balances summaries

## Telegram Integration

- Telegram webhook endpoint will be hosted on the backend.
- Booking requests created from bot messages.
- Admin commands return summaries.

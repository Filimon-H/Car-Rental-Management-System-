# End-to-end tests

Playwright tests that drive the landing site, the admin app and the API together in a real browser.

```bash
cd e2e
npm install
npx playwright install chromium   # skip if Chromium is already cached
npm test                          # headless
npm run test:headed               # watch it run
npm run report                    # open the last HTML report
```

## What runs

`npm test` starts its own copy of everything, so you don't need to start anything yourself:

| Piece   | Port | How |
|---------|------|-----|
| API     | 8101 | `scripts/start-backend.sh`: a fresh SQLite database at `e2e/.tmp/e2e.db`, built with `alembic upgrade head` and seeded by `scripts/seed.py` |
| Landing | 5274 | `npm run dev` in `landing/`, proxied to the e2e API |
| Admin   | 3100 | `npm run dev` in `frontend/`, proxied to the e2e API |

The real database (`backend/car_rental.db`) and the dev servers on 8001, 5174 and 3000 are never touched.

- The seed script refuses to run unless `DATABASE_URL` contains `e2e`.
- `VITE_API_BASE_URL` is pinned to `/api`, so `frontend/.env` can't point the admin app at the real API.
- `reuseExistingServer` is off, so a server already running on an e2e port makes the run fail instead of being used.

The Telegram bot and the scheduler are switched off for the run.

## Seed data

- Staff user `admin`, password `e2e-admin-pass` (override with `E2E_ADMIN_PASSWORD`)
- 2024 Toyota Yaris, 1,100/day, 6,500/week, always free
- 2024 Toyota Corolla, 1,500/day, held by a pending-payment booking from day 30 to day 37

Days count from today, so the tests don't depend on the calendar.

## The tests

- `tests/public-site.spec.ts`:
  - the fleet list
  - hero Book Now
  - the date search, which leaves out the held car and prices the whole window
  - keyboard access to the car dialog
  - contact form validation
  - the 404 page
  - the sign-in redirect
- `tests/booking-journey.spec.ts`, which runs in order:
  1. Sign up.
  2. Search a week: the weekly rate applies.
  3. Request the car.
  4. A clashing request is refused.
  5. Staff sign in, approve it and post the full payment.
  6. The customer sees it charged, paid, and nothing owed.

If Chromium can't be downloaded on your network, set `E2E_CHROMIUM` to a Chrome or Chromium binary.

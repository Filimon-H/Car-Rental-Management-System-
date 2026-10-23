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
| API     | 8101 | `scripts/start-backend.sh`: a fresh SQLite database at `e2e/.tmp/e2e-8101.db`, built with `alembic upgrade head` and seeded by `scripts/seed.py` |
| Landing | 5274 | `npm run dev` in `landing/`, proxied to the e2e API |
| Admin   | 3100 | `npm run dev` in `frontend/`, proxied to the e2e API |

The real database (`backend/car_rental.db`) and the dev servers on 8001, 5174 and 3000 are never touched.

- The seed script refuses to run unless `DATABASE_URL` contains `e2e`.
- `VITE_API_BASE_URL` is pinned to `/api`, so `frontend/.env` can't point the admin app at the real API.
- `reuseExistingServer` is off, so a server already running on an e2e port makes the run fail instead of being used.

The Telegram bot and the scheduler are switched off for the run.

If another test server occupies these ports, choose separate ports instead of
reusing it. The database filename follows the API port; the helper for simulated
Telegram updates uses the same file. Run from `e2e/`:

```bash
E2E_API_PORT=18101 E2E_LANDING_PORT=15274 E2E_ADMIN_PORT=13100 npm test
```

The test backend and Python helper explicitly use `DEBUG=false`, so an inherited
non-boolean shell value does not prevent startup. Browser contexts use Addis
Ababa time to match the application's business dates.

## Seed data

- One staff user per role, for testing permissions:

  | User | Role | Password (override with) |
  |------|------|--------------------------|
  | `admin` | admin | `e2e-admin-pass` (`E2E_ADMIN_PASSWORD`) |
  | `sales1` | sales | `e2e-sales-pass` (`E2E_SALES_PASSWORD`) |
  | `fleet1` | fleet | `e2e-fleet-pass` (`E2E_FLEET_PASSWORD`) |
  | `inspector1` | inspector | `e2e-inspector-pass` (`E2E_INSPECTOR_PASSWORD`) |
  | `accountant1` | accountant | `e2e-accountant-pass` (`E2E_ACCOUNTANT_PASSWORD`) |

  These exist only in the throwaway test database.
- Two customers entered at the counter with a past rental and no website login (Tsion, Dawit), and one with a rental already out (Hiwot)
- 2024 Toyota Yaris, 1,100/day, 6,500/week, always free
- 2024 Toyota Corolla, 1,500/day, held by a pending-payment booking from day 30 to day 37
- 2024 Toyota Vitz, 1,100/day, reserved for the full rental lifecycle tests
- All three cars are held on days 60–65 for the no-availability scenario

Days count from today, so the tests don't depend on the calendar.

## The tests

- `tests/full-rental-lifecycle.spec.ts`: two continuous journeys, each with a
  newly registered member and separate customer/staff browser sessions:
  1. Reject mismatched passwords, register, sign out, and sign back in.
  2. Select a vehicle, provide identity details, and request a three-day rental.
  3. Staff approve with a 1,000 ETB deposit and 1,100 ETB required advance.
  4. Reject handover before the deposit and again before the advance are paid.
  5. Receive the deposit separately from rent and record payment through the UI.
  6. Activate the handover and verify the customer sees Active.
  7. Return the same vehicle after its pickup time has arrived.
  8. Partial-payment case: apply the deposit, block closure with 1,200 ETB owed,
     record settlement, then close. Full-payment case: close and refund the
     unused deposit automatically.
  9. Reload both apps; verify closure, zero balance, deposit accounting, and
     exactly the expected ledger entries. Confirm the car is bookable again.

  All writes use real UI forms. Responses are observed for assertions, not
  mocked. The tests wait about 1–2 minutes each for the real pickup time, then
  perform an early return; they do not backdate bookings or change the clock.
  These cover recorded cash payments, not an external payment gateway, and
  do not cover late-return penalties or inspections.

  To run only these journeys:

  ```bash
  npm test -- tests/full-rental-lifecycle.spec.ts
  ```

  Use the port overrides above if needed. Open the step-by-step results with
  `npm run report`; failures retain screenshots and traces.

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

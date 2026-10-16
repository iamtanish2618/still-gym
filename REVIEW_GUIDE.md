**Live app:** [still-gym.vercel.app](https://still-gym.vercel.app). Choose Create account to make your own member account. Staff sessions appear after the studio admin creates them.

> Live accounts are self-created through signup. The public credentials below are for the optional local reviewer fixture only. Production is not seeded with demo accounts.

# Reviewer guide

This guide makes the core booking flow easy to inspect and reproduce. The [README](README.md) contains full local setup, the eight-line stack/data-model note and assumptions. The repository is public. Deployment is optional under the brief; the current hosted migration failure is documented in [DEPLOYMENT.md](DEPLOYMENT.md). There is no verified public website link.

## Run the app

Follow [the optional reviewer setup](README.md#optional-reviewer-dataset). Normal setup starts empty. The explicit reviewer fixture creates sessions relative to today, including a full session and a currently running session for check-in. No hosting account or private application credential is required for local use.

| Role | Email | Password |
| --- | --- | --- |
| Member | `aanya@still.demo` | `StillDemo2026!` |
| Second member | `member1@still.demo` | `StillDemo2026!` |
| Admin | `admin@still.demo` | `StillDemo2026!` |

These are public demo accounts.

## Try the core booking flow

1. Log in as Aanya and choose **All upcoming**. Book a future session with a free mat. Its count decreases immediately; **My bookings** contains the confirmation and short code.
2. Cancel it from **My bookings**, then return to the schedule and rebook. There is one active reservation, and the rebooking has a fresh code.
3. Join the seeded full session's waitlist. Aanya sees position 1 and no usable code. Keep that page open.
4. In a separate browser profile or private window, log in as `member1@still.demo`. Cancel that member's booking for the same full session.
5. Without refreshing Aanya's page, observe confirmation, a promotion notice and a check-in code on the next successful poll, normally within three seconds. The session still has twenty confirmed bookings. On a slow or disconnected connection, the update arrives after the next successful read.
6. As admin, enter the code from Aanya's **currently running seeded session**. The first use shows her name and records attendance; reuse fails. A future-session code also fails. The active seeded hour expires naturally, so do this soon after seeding.
7. As admin, create a future session and open its register. As a member, attempt `/#/admin`: the client redirects, while direct admin API requests are independently forbidden.

Browser sessions use HttpOnly cookies. Use separate browser profiles or private windows for different accounts; tabs in one profile share the login. These actions intentionally change demo data.

## Verify the requirements

| Requirement | What to inspect or try | Automated evidence |
| --- | --- | --- |
| Hashed passwords, unique email, token login, database-created admin | Register a member; duplicate email and supplied admin role fail | [API tests](test/api.test.mjs), [cookie auth tests](test/auth-sessions.test.mjs) |
| Hourly sessions, unique start, exactly 20 mats | Admin session form; duplicate start and invalid capacity fail | [API tests](test/api.test.mjs), [schema](db/schema.ts) |
| Never 21 confirmed bookings | Race requests against a nearly/full session; the database decides | [Real HTTP/libSQL audit](test/live-booking.mjs): 32 requests, 20 confirmations, 12 conflicts |
| One active booking; cancel before start; rebook | Repeat a booking, cancel it and rebook | [Invariant tests](test/booking-invariants.test.mjs), partial unique index in [migration](drizzle/0000_shallow_paibok.sql) |
| Full-only waitlist, positions, leave queue, FIFO promotion | Use the two-member demonstration above | [API tests](test/api.test.mjs), [HTTP/libSQL audit](test/live-booking.mjs) |
| No promotion after start; exact booking/cancellation boundaries | Inspect execution-time SQL guards | [Boundary and crossing-request tests](test/booking-invariants.test.mjs) |
| Random code, only once, during its hour, never cancelled | Admin check-in; try replay, future and cancelled codes | [API tests](test/api.test.mjs), [HTTP/libSQL audit](test/live-booking.mjs) |
| Members see only their own data; admin sees session register | Use separate accounts and call protected endpoints | [API tests](test/api.test.mjs) |
| Server validation, consistent errors, global handler | Send invalid requests; no stack trace is returned | [API tests](test/api.test.mjs), [handler](server/api.mjs) |
| Protected routes, labels, keyboard use, mobile layout | Member admin URL; keyboard skip link; 360px viewport | [Browser smoke](test/browser.mjs), [state tests](test/browser-states.mjs) |
| Loading, error, empty and success states; optimistic rollback | Empty date, offline connection, rejected booking | [Browser state tests](test/browser-states.mjs) |
| Live updates and recovery under adverse connections | Leave a waitlist open; delay or drop an HTTP response | [Browser booking audit](test/browser-booking-audit.mjs) |
| Real related database tables and seed data | Inspect users, sessions, bookings, tokens and rate limits | [Schema](db/schema.ts), [optional reviewer fixture](test/fixtures/demo-seed.mjs), local SQLite setup |
| Public repo, commit history, setup, credentials, assumptions, environment example | Inspect GitHub history, README and `.env.example` | [README](README.md), [.env.example](.env.example) |

## Run the checks yourself

After `npm ci`:

```sh
npm test
npm run typecheck
npm run build
```

The 24 automated test groups use isolated databases and do not alter the demo data. One test deliberately injects an internal error and verifies the safe response; its `API error Error` log is expected.

For browser and real HTTP/libSQL audits, follow the separate local-database commands in [BOOKING_AUDIT.md](BOOKING_AUDIT.md#repeat-the-checks). The browser tests modify fixtures and the check-in tests consume the active code, so each fresh run's data requirements are documented.

The results demonstrate correctness under the tested races and failures. They are not a throughput or production-scale performance benchmark. The underlying database rules and source are available for independent review.

## Useful implementation entry points

- [Booking API and authorization](server/api.mjs): reservation, cancellation, own bookings, staff register and check-in.
- [Database rules](drizzle/0000_shallow_paibok.sql): atomic capacity guard, unique active booking and cancellation-triggered FIFO promotion.
- [Member and staff UI](app/gym.tsx): protected routes, optimistic updates, polling and reconciliation.
- [Booking audit](BOOKING_AUDIT.md): failures reproduced, fixes made and exact verification scope.

Task 1 is submitted separately as the [public Canteen Chaos fork](https://github.com/iamtanish2618/canteen-chaos), with its own debugging log and regression tests.

For a full flow without demo data, see [Clean-database backend verification](README.md#clean-database-backend-verification). Normal UI/API requests always query the persistent database.

Admins can turn on **Member mode** to book sessions and manage their own bookings without another account. Turn it off to return to the studio desk. The switch never changes database roles and is hidden from members. The API test suite and `test/browser-admin-switch.mjs` verify same-account booking and staff-access restrictions.

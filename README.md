# Still — Gym Slot Booking

A minimal gym booking app for BYTE’s web development challenge. Members reserve one of twenty mats, join a fair waitlist, and show a short code at the door. Staff create sessions and manage attendance. Every account and booking in the live app comes from the shared database.

**Live website:** [still-gym.vercel.app](https://still-gym.vercel.app)

**Repository:** [iamtanish2618/still-gym](https://github.com/iamtanish2618/still-gym) · **Review:** [reviewer guide](REVIEW_GUIDE.md) · **Hosting:** [deployment notes](DEPLOYMENT.md)

![Still member schedule](docs/screenshots/schedule-preview.png)

## Stack and data model (8 lines)

1. React + TypeScript frontend, responsive CSS and protected hash routes.
2. Next.js serves the UI and same-origin REST API on Vercel Node.js Functions.
3. Turso/libSQL provides shared persistent SQL storage; local development uses a SQLite file.
4. `users` holds unique normalized usernames/emails, salted password hashes and server-assigned roles.
5. `sessions` has unique IST hour starts and a CHECK constraint fixing capacity at 20.
6. `bookings` stores booking state, random code and attendance timestamp.
7. A partial unique index prevents duplicate active bookings; triggers guard capacity and promote FIFO atomically.
8. `tokens` stores digests of expiring opaque tokens; `rate_limits` provides shared authentication/check-in throttling.

## Quick start

Requires **Node.js 22.13+** (Vercel uses Node 24), npm and Git. No cloud account is needed for local use.

```sh
git clone https://github.com/iamtanish2618/still-gym.git
cd still-gym
npm ci
npm run db:migrate
npm run admin:create
npm run dev
```

Open `http://127.0.0.1:5173`. Normal setup creates **no predefined users, sessions or bookings**. The admin CLI asks for your name, email and a hidden password. It hashes that password and inserts an admin through a trusted database connection; it refuses an existing email. Public signup only creates members, with a chosen username, email and password. Login accepts either email or username. The client confirms passwords before submitting and can show/hide them.

Local data persists in `.local/still.db`. To use a separate file, pass the same `LOCAL_DATABASE_PATH` to migration, admin creation and the server. An existing database is never reset automatically. Migrations apply complete SQL statements transactionally and record checksums. Applied migrations cannot silently change.

`.env.example` lists configuration names. Server scripts and Next.js load `.env.local`; **if Turso credentials are present, they use that shared database**. For an isolated local database after pulling Vercel variables, explicitly clear the two remote variables:

```sh
TURSO_DATABASE_URL= TURSO_AUTH_TOKEN= LOCAL_DATABASE_PATH=.sites-runtime/reviewer.db npm run db:migrate
TURSO_DATABASE_URL= TURSO_AUTH_TOKEN= LOCAL_DATABASE_PATH=.sites-runtime/reviewer.db npm run db:seed:demo
TURSO_DATABASE_URL= TURSO_AUTH_TOKEN= LOCAL_DATABASE_PATH=.sites-runtime/reviewer.db npm run dev
```

Passwords, tokens, environment files and database files stay outside Git. `admin:create` also accepts JSON on standard input for automation; never pass passwords as command-line arguments. No admin bootstrap, seed or reset endpoint is exposed over HTTP.

## Optional reviewer dataset

The brief requests test credentials and sessions including a full one. These exist exclusively in [the opt-in fixture](test/fixtures/demo-seed.mjs), loaded by `db:seed:demo` into an empty **local** database. The command refuses hosted databases and existing accounts. Production starts empty; real members sign up and staff create sessions.

| Role | Email | Local fixture password |
| --- | --- | --- |
| Admin | `admin@still.demo` | `StillDemo2026!` |
| Member | `aanya@still.demo` | `StillDemo2026!` |
| Member | `kabir@still.demo` | `StillDemo2026!` |
| Member in full session | `member1@still.demo` | `StillDemo2026!` |

These are public **local fixture credentials**, never live credentials. The fixture creates 23 users, 26 sessions, one full session, partially occupied sessions and an active check-in example. Dates are relative to seeding. The screenshot gallery shows this separate reviewer dataset.

1. Log in as Aanya, choose **All upcoming**, and join the full session’s waitlist.
2. My bookings shows position 1 and no usable code.
3. In a separate browser, log in as `member1@still.demo` and cancel the same session.
4. Aanya’s page shows promotion and a code on the next successful poll, normally within three seconds. Occupancy stays at twenty.
5. Cancel a future booking and rebook: the new booking has a fresh code.
6. Use Aanya’s active-session code at the admin desk. Replay, future and cancelled codes fail.
7. Create a future session as staff; duplicate hours fail. Members cannot access staff endpoints.

## Verification

```sh
npm test
npm run typecheck
npm run build
```

The 23 test groups exercise the actual handler, migrations and SQL constraints. They cover authentication/CSRF, role/ownership enforcement, username/email uniqueness, salted passwords, 32 competing bookings, duplicate prevention, FIFO promotion, execution-time boundaries, one-time check-in, lost-response retries and 500 mixed operations. The libSQL test uses **four independent connections to the same database**, checking that a newcomer cannot jump a waiting member during cancellation. An intentionally injected internal error prints `API error Error`; its response must remain safe.

For browser regression tests, create a fresh local reviewer database and run it at port 5174 (`npm run dev -- --port 5174` with the same explicit database environment). Then:

```sh
TEST_URL=http://127.0.0.1:5174 CHROME_CHANNEL=chrome npm run test:browser
TEST_URL=http://127.0.0.1:5174 CHROME_CHANNEL=chrome npm run test:browser:audit
TEST_URL=http://127.0.0.1:5174 npm run test:live
```

If Chrome is unavailable, run `npx playwright install chromium` and omit `CHROME_CHANNEL`. Browser tests check 360/768/1280 layouts, keyboard focus, signup, booking, waitlist promotion, optimistic rollback, offline recovery, slow polling, lost responses and staff registers. The HTTP audit checks 32 competing requests and check-in races. Tests modify only their isolated fixtures; check-in consumes the active code, so start with fresh data for a complete repeat.

### Clean-database backend verification

This flow uses **no demo seed**. Use a fresh file:

```sh
TURSO_DATABASE_URL= TURSO_AUTH_TOKEN= LOCAL_DATABASE_PATH=.sites-runtime/real-audit.db npm run db:migrate
TURSO_DATABASE_URL= TURSO_AUTH_TOKEN= LOCAL_DATABASE_PATH=.sites-runtime/real-audit.db npm run dev -- --port 5175
# In another terminal:
TEST_URL=http://127.0.0.1:5175 TEST_DB_DIR=.sites-runtime/real-audit.db CHROME_CHANNEL=chrome npm run test:browser:real
```

The test creates its own temporary admin with generated credentials, registers a member through the UI, creates a session through the admin desk, books/cancels/rebooks, reloads to prove persistence, verifies ownership and role restrictions, and verifies logout revocation. It refuses remote URLs. [Booking audit](BOOKING_AUDIT.md) records verification scope and fixes.

## How correctness works

Booking inserts one row. A database trigger checks confirmed occupancy inside that atomic write and aborts the twenty-first booking. The partial unique index covers confirmed and waitlisted states together. API validation provides readable messages; database constraints enforce the race-sensitive rules across all server instances.

Cancellation marks a row cancelled. An AFTER trigger promotes the smallest waiting ID for the same future session **within the same statement**. No newcomer can take a released seat between cancellation and promotion. Leaving the queue does not promote anyone. FIFO uses database IDs, independent of client clocks.

Codes use eight random base-32 characters (40 bits), have a unique index and bounded collision retries, and are hidden while waiting. Check-in performs one conditional UPDATE for a confirmed, unchecked booking during `[start, start + one hour)`. Duplicate concurrent check-in attempts cannot both succeed. The database clock decides booking/cancellation/check-in boundaries at execution time.

The client polls every three seconds while visible and on focus. It ignores stale responses and deduplicates slow reads. Booking updates availability immediately; rejection rolls it back. After a lost write response, the client reads the server’s actual booking records instead of blindly repeating the write. Requests time out after fifteen seconds. The server remains authoritative.

Production instances all access the same remote primary through `@libsql/client`. They never use a local file, embedded replica or in-memory booking list. The adapter maps parameterized statements to libSQL; write batches are atomic. Vercel refuses to start database operations without a remote URL and token. API responses use `no-store` so one member’s data cannot enter a shared response cache.

## API

Authenticated browsers use an HttpOnly, SameSite=Strict cookie, Secure on HTTPS, with seven-day expiry. Login/register with `X-Still-Client: browser` sets the cookie and omits the token from JSON. Non-browser clients receive an opaque token and use `Authorization: Bearer <token>`. Tokens are stored only as SHA-256 digests. Foreign-origin writes are rejected; cookie writes require matching Origin and the application header. Logout revokes the token and clears the cookie.

| Method / route | Access | Purpose |
| --- | --- | --- |
| POST `/api/auth/register` | Public | `{name,username,email,password}`; create member |
| POST `/api/auth/login` | Public | `{email,password}`; `email` accepts email or username |
| GET `/api/health` | Public | Database health and server time |
| GET `/api/auth/me` | Authenticated | Current identity |
| POST `/api/auth/logout` | Authenticated | Revoke session |
| GET `/api/sessions?date=YYYY-MM-DD` | Authenticated | Sessions and availability, optional IST date |
| POST `/api/sessions` | Admin | `{date,hour,title}`; capacity is always 20 |
| POST `/api/sessions/:id/book` | Member | `{}`; reserve |
| POST `/api/sessions/:id/waitlist` | Member | `{}`; queue for a full session |
| GET `/api/bookings` | Authenticated | Own bookings only |
| DELETE `/api/bookings/:id` | Owner member | Cancel/leave queue before start |
| GET `/api/sessions/:id/bookings` | Admin | Register and attendance |
| POST `/api/check-in` | Admin | `{code}`; check in once |

Errors use `{ "error": { "code": "...", "message": "...", "fields": {} } }`. Invalid inputs return 400/422, missing authentication 401, forbidden roles 403, absent/unowned records 404, conflicts 409, throttling 429, unexpected errors a safe 500, and temporary unavailability 503. Creation returns 201. JSON bodies are bounded to 8 KiB by bytes, including streamed requests.

## Assumptions and operational limits

- Gym times use **Asia/Kolkata (IST)**; stored timestamps are UTC milliseconds. Starts align to IST hours.
- Every session lasts one hour and has twenty mats; these are required business rules, not placeholder records.
- Staff create sessions up to one year ahead. Members can book distinct sessions; staff use a separate member account to book.
- Waitlists are full-only; cancellation/departure stop at start. Expired queues never promote.
- Rebooking creates a fresh code; cancelled bookings remain history. Check-in has no grace period.
- Live updates normally arrive within three seconds while connected. Background tabs refresh on focus.
- The default list covers 90 days/240 sessions; exact-date filtering can reach later sessions.
- Usernames are case-insensitive, 3–24 ASCII letters/numbers/underscores. Names are 2–60 characters; passwords are 10–128 characters. New hashes use PBKDF2-SHA256 with random salts and 600,000 iterations; older 100,000-iteration hashes remain verifiable.
- This scope does not include email ownership verification, password recovery or email notifications. Do not imply that an email was verified. Account recovery and operational alerting are needed for a broader service rollout.
- Concurrency checks demonstrate correctness for the tested races, not unlimited capacity or a production throughput certification. Vercel/Turso free-tier quotas apply. Monitor usage and maintain backups before broader adoption.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md). Vercel hosts Next.js Functions and Turso hosts the persistent database, both configured in Mumbai (`bom1`). Credentials are server-only integration variables; migrations run explicitly before deployment. No runtime schema creation or seeding occurs. An admin is provisioned through a trusted CLI/database operation; public signup cannot grant staff access.

## Design and assistance

Restrained typography, neutral/sage surfaces and generous spacing follow the supplied [Lucid reference](https://dribbble.com/shots/27524013-Lucid-AI-recovery-ecosystems-Website). Artwork is CSS. Buttons have a gentle press/release bounce; curved dropdowns have a small hover zoom. Reduced-motion preferences disable these effects.

AI assistance was used with the candidate’s stated permission from the society. The candidate should understand the code and be prepared to modify it during the walkthrough; no claim of unaided authorship is made. Git commits use the repository owner’s verified GitHub identity.

Task 1 is submitted separately as [iamtanish2618/canteen-chaos](https://github.com/iamtanish2618/canteen-chaos), with its own debugging log and regression tests.

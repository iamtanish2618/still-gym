# Booking flow audit — 15 October 2026

The booking flow was reviewed across the member UI, HTTP API, real local D1 runtime and SQLite schema. The server and database remain the authority. No claim of mathematical perfection or production load certification is made.

## Issues found and corrected

1. **Slow polling could prevent data from appearing.** With every session response delayed by 4.5 seconds, the old 3-second poll repeatedly invalidated the previous request. The page stayed on “Finding your next hour…” after eleven seconds. Quiet polling now lets the current read finish. Explicit navigation and date changes still invalidate old responses. The same correction applies to the staff register.
2. **A lost response was treated as a failed write.** A booking/cancellation can commit while the browser loses its response. The client now reads back the member's actual records and reports the confirmed outcome. It does not automatically repeat a mutation. Rejected bookings still roll back optimistic availability.
3. **Promotion during a waitlist join could display “number null.”** A cancellation can promote a newly queued member before the join response is returned. The success message now uses the returned booking state, not the button originally clicked.
4. **Confirmed bookings depended on a subsequent GET to appear.** The successful POST response now populates My bookings immediately; a successful cancellation immediately removes its usable code. A background read reconciles both with the server.
5. **Waitlist edge states were misleading.** Queue positions over 99 are no longer truncated. Once a session starts, its waitlist shows as closed and stops promising a future promotion.
6. **Staff browsing used member booking controls.** Admins now open the selected session's register instead. The API role restriction remains in place.
7. **Stalled requests and session changes needed tighter handling.** Requests have a fifteen-second timeout. Mutation controls stay disabled through reconciliation, and late unauthorized responses from an old token cannot clear a newer login. Logging out clears cached booking and roster data.

## Verified invariants

- 32 simultaneous HTTP booking requests against the actual D1 binding yield exactly **20 confirmations and 12 conflicts**.
- No duplicate active booking or simultaneous booking/waitlist place per member and session.
- Cancelling twice releases one mat and promotes one person, exactly once.
- Concurrent queue departure and confirmed cancellation do not strand a free mat or skip the next waiting member.
- A newcomer racing a cancellation cannot jump an existing queue.
- Leaving a queue updates positions. Waiting members receive no usable code.
- Cancellation followed by rebooking creates a fresh code; the old cancelled code fails.
- Booking/cancellation stop at the session start. Check-in starts at that boundary, succeeds once and ends at the hour's exclusive end.
- A request crossing a time boundary is judged at SQL execution, not by an earlier application timestamp.
- Two simultaneous check-in requests for one code yield one success and one conflict on real D1.
- Member ownership and admin authorization hold at the API boundary.
- A deterministic model checks capacity, unique active records and FIFO order after 500 mixed operations, including full and partially occupied states.

## Browser evidence

The normal browser suites cover registration/login, optimistic rollback on 409, booking/cancellation/rebooking, waitlist promotion without refresh, protected routes, check-in/replay, offline recovery and 360/768/1280 layouts.

The added browser audit covers slow reads, a real committed booking with its response deliberately dropped, the same failure during cancellation, persistence after page reload, promotion while a join response is in transit, queue position 100, closure at session start, and staff creation/register access. Browser exceptions are captured and must remain empty.

## Repeat the checks

```sh
npm test
npm run typecheck
npm run build
```

`npm test` includes 15 test groups, including the five added invariant groups. Tests create isolated SQLite databases. The deliberately injected internal error prints `API error Error` and must still produce a safe JSON response.

For HTTP and browser tests, use a separate **fresh seeded local D1 database**. These tests modify demo data and refuse non-local URLs. Build first, then:

```sh
LOCAL_DB_DIR=.sites-runtime/audit-db npm run db:migrate
LOCAL_DB_DIR=.sites-runtime/audit-db npm run db:seed
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js dev --config dist/server/wrangler.json --local --persist-to .sites-runtime/audit-db --ip 127.0.0.1 --port 5174 --inspector-port 0
```

In another terminal:

```sh
TEST_URL=http://127.0.0.1:5174 CHROME_CHANNEL=chrome npm run test:browser
TEST_URL=http://127.0.0.1:5174 CHROME_CHANNEL=chrome npm run test:browser:audit
```

Use `npx playwright install chromium` and omit `CHROME_CHANNEL` if Chrome is unavailable. The first suite consumes the active seeded check-in code. For the real HTTP check-in race, use a second fresh database directory/server instead of the browser test's database:

```sh
TEST_URL=http://127.0.0.1:5174 npm run test:live
```

Do not remove a database someone is using. Choose a new local directory for each fresh audit. Local tests and hosted data are separate. The existing optional hosting migration failure is documented in DEPLOYMENT.md and was not changed by this audit.

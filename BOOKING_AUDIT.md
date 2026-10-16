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

The current runtime is Next.js + shared Turso/libSQL on Vercel. See [README verification](README.md#verification) for current commands. The original 15 October audit below refers to the earlier local D1 runtime; its SQL invariants have been retained. The 16 October migration adds a four-connection libSQL concurrency test and username authentication tests (23 groups total).

## Authentication and real-use follow-up — 16 October 2026

Browser login now uses server-issued HttpOnly, SameSite=Strict cookies, Secure on HTTPS, with same-origin/custom-header validation for cookie writes. Logout revokes the stored session and clears its cookie. Non-browser Bearer token login remains supported. There are now 21 automated test groups.

The demo seed moved to test fixtures; it is CLI-only and is absent from the compiled runtime. Normal setup is empty and uses a separate database from the optional reviewer dataset. `npm run admin:create` provisions an administrator directly in the database with a chosen email and a hidden password; it neither creates a public admin-registration route nor elevates an existing member.

A new browser flow passed against an EMPTY real D1 database: CLI admin, UI member registration, cookie login, admin UI session creation, booking, reload persistence, cancellation/rebooking with a fresh code, member privacy, server role enforcement and invalidated logout. All existing browser suites also passed after the cookie transition.

## UI and resilience follow-up — 16 October 2026

The suite now has 21 test groups. New regressions cover streamed request limits, multibyte payloads, invalid UTF-8, malformed content types, real SQLite code collisions with bounded retries, and invalid password records. Existing capacity, FIFO, ownership and check-in rules are unchanged. Session availability visuals read the capacity returned by the API. Button press feedback has been checked in Chrome, including reduced-motion behavior.

Verification note: one local browser-audit run timed out while loading the runtime JavaScript asset; the local Worker logged a delayed static-asset response. A direct follow-up fetched that asset with HTTP 200 in approximately 3.5 ms, and the complete audit rerun passed without application changes. No application exception was observed in that rerun.

## Vercel / Turso verification — 16 October 2026

The Next.js migration retained the original triggers and constraints. All 23 backend groups, type checking and production build passed, including CI on Node 24. A libSQL regression uses four independent database connections and checks capacity/FIFO across connections.

The empty-database browser flow passed without fixtures. Browser regression checks passed for signup, optimistic rollback, offline recovery, slow polling, lost responses, promotion during join, mobile layouts and staff registers. Migration-specific issues corrected: Next’s internal localhost URL needed canonicalization against the served Host for CSRF; logout needed to return newly registered members to the login form. Tests now distinguish Next’s route announcer from application alerts and tolerate automatic reconnect removing a retry button.

The public deployment at https://still-gym.vercel.app passed 32 simultaneous booking requests (20 confirmations, 12 conflicts), FIFO/no-queue-jumping, privacy/roles and one-time concurrent check-in. A live browser verified fresh signup, password confirmation, secure cookies, real booking/reload/cancellation, logout and username login. Generated audit records were removed. See [deployment evidence](DEPLOYMENT.md#verification-status).

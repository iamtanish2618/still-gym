# Code walkthrough

## Boundaries

| Area                                         | Responsibility                                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `app/gym.tsx`                                | Client entry point and application shell.                                                          |
| `app/components/`                            | Focused views for authentication, sessions, bookings and the staff desk; shared labelled controls. |
| `app/hooks/use-gym.ts`                       | Composes the hooks into the view model.                                                            |
| `app/hooks/use-gym-state.ts`                 | Shared screen state and request counters. Never the source of truth for reservations.              |
| `app/hooks/use-api.ts`                       | Cookie-authenticated requests, timeouts, safe errors and expired-session cleanup.                  |
| `app/hooks/use-authentication.ts`            | Restore identity, register, log in and log out.                                                    |
| `app/hooks/use-navigation.ts`                | Protected hash routes, URL date/register filters and the displayed clock.                          |
| `app/hooks/use-schedule.ts`, `use-roster.ts` | Independent live reads, slow-request deduplication and stale-response protection.                  |
| `app/hooks/use-booking-actions.ts`           | Optimistic booking, rollback, cancellation and read-back after lost responses.                     |
| `app/hooks/use-staff-actions.ts`             | Session creation and check-in forms.                                                               |
| `app/lib/`                                   | Shared types, date formatting, errors and request invalidation.                                    |
| `app/styles/`                                | Ordered feature styles, responsive overrides and accessible motion settings.                       |
| `app/api/[...path]/route.ts`                 | Next.js transport adapter and database-unavailable response.                                       |
| `server/api.mjs`                             | Small API dispatcher and global error boundary.                                                    |
| `server/context.mjs`, `authenticate.mjs`     | Request-local dependencies, CSRF, throttling, token lookup and trusted role checks.                |
| `server/routes/`                             | Login/registration, identity, sessions, bookings and check-in handlers.                            |
| `server/http/`                               | Bounded JSON decoding, validation and consistent error responses.                                  |
| `server/database.mjs`                        | Shared libSQL connection setup and parameterized SQL adapter.                                      |
| `drizzle/`                                   | Immutable, checksummed schema migrations and atomic booking constraints/triggers.                  |
| `scripts/lib/migrations.mjs`                 | Transactional migration runner; checksums prevent silent edits.                                    |
| `scripts/audit/`                             | Explicit operator verification and guarded cleanup, separate from application startup.             |
| `tests/`                                     | Unit/integration tests, browser workflows, isolated fixtures and reusable test helpers.            |

Components receive only the state/actions they use through typed props. Hooks share stable setters and request refs; dependencies are checked by ESLint. The composition hook coordinates them without duplicating network or booking rules. There is no runtime dependency on the reviewer fixture. A test rejects application, operator and test modules over 300 lines.

## Explain a booking

1. `SessionTable` calls `book(session)` from `use-booking-actions`.
2. The hook immediately updates the displayed count and disables other mutations. This is feedback, not authorization or a seat guarantee.
3. `use-api` sends a same-origin cookie-authenticated POST.
4. `server/api.mjs` builds request-local context and authenticates the token from its stored digest. The booking handler validates the requested session and body.
5. One SQL INSERT runs against the shared primary. A trigger checks the session has not started and that fewer than 20 confirmed bookings exist. A partial unique index allows only one active booking per user/session. Separate function instances cannot bypass these rules.
6. The server generates an unpredictable code. A unique-code collision retries only the aborted insert, at most three times; capacity and member conflicts are not retried.
7. The accepted booking returns to the UI. A refused optimistic update rolls back. If the write response is lost, the hook reads actual bookings to reconcile before offering a retry.

## Explain cancellation and promotion

Cancellation is a conditional UPDATE restricted to the booking owner and a future session. Its database trigger promotes the oldest waiting booking inside the same statement. The promoted record retains its ID and receives its already allocated, previously hidden code. Another client cannot take the released seat between cancellation and promotion. The live-read hook updates the waiting member's screen on the next successful poll, without a manual reload.

## Explain persistence and permissions

Accounts, sessions, bookings and token hashes live in Turso. Refreshing or logging out does not delete them. Logout revokes only the current token. A new login resolves the same user ID and therefore the same bookings. URL filters preserve the selected date/register separately from stored business data.

Public registration always inserts a member. Trusted admin provisioning happens through the database CLI. The admin-only Member mode switch changes the route, never the role. Staff endpoints still check the authenticated database role, and personal booking endpoints still check ownership.

## Explain check-in

The staff handler performs one conditional UPDATE matching a confirmed, unused code during `[session start, session end)`, using the database execution clock. The second simultaneous use matches no row and returns a conflict. Future, cancelled and expired codes cannot be checked in.

## Review practice

Walk through one booking, one cancellation/promotion and one failed authorization directly in the files above. Practise changing a form label and adding a validation case, then run `npm run test:all`. Explain why changing only the browser's capacity or hiding a staff button cannot enforce the rules. BYTE requires being able to explain and modify the submitted code; automated checks do not replace that walkthrough.

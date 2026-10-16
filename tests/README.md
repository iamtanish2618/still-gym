# Verification suite

Run from the repository root after `npm ci`:

```sh
npx playwright install chromium
npm run test:all
```

For installed Google Chrome, use `CHROME_CHANNEL=chrome npm run test:all` instead of downloading Chromium.

`test:all` checks TypeScript, ESLint (including hook dependencies and accessibility rules), backend coverage, the production build, then all nine isolated browser/HTTP suites. `npm run format:check` checks formatting and also runs in CI.

## Layout

- `unit/`: API contracts, credentials, cookies/CSRF, roles, ownership, input limits, throttling, session validation, booking/FIFO invariants, check-in, shared libSQL concurrency, durable storage, migrations and IST date boundaries.
- `browser/`: actual browser signup/login, routing, optimistic changes/rollback, slow and lost responses, promotion, booking persistence across fresh browser contexts, staff mode, schedule filters, keyboard/mobile behavior and automated axe WCAG A/AA checks.
- `helpers/`: isolated database adapters and reusable fixtures, without hiding test assertions.
- `fixtures/`: explicit, local-only reviewer data. Never imported by the application.
- `run-browser.mjs`: creates a unique database and server for each suite, clears cloud credentials in child environments, runs the tests and removes that run's files. One suite starts with no demo seed and creates its own accounts/sessions through the real app.

## Commands

| Command                                          | Scope                                                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `npm test`                                       | All Node tests with real SQL constraints/migrations.                                               |
| `npm run test:coverage`                          | Same tests with measured `server/**/*.mjs` coverage; minimum 95% lines/functions and 85% branches. |
| `npm run test:e2e`                               | All nine browser/HTTP suites; requires a production build.                                         |
| `node tests/run-browser.mjs browser-persistence` | One named suite with its own database/server.                                                      |
| `npm run lint`                                   | Source, hooks, accessibility markup and test linting.                                              |
| `npm run format:check`                           | Consistent source/test formatting.                                                                 |
| `npm run typecheck`                              | TypeScript contracts.                                                                              |

The old individual browser commands remain available for an already-running **isolated local** server. Prefer the runner: different suites consume bookings/check-in codes and must not share stale fixtures.

## What the checks establish

The concurrency checks use independent libSQL connections and real HTTP requests: 32 contenders yield 20 confirmations and 12 conflicts; a two-person race for the last mat yields one acceptance; duplicate requests cannot create two active bookings; cancellation promotes the FIFO head atomically. Boundary tests move the database execution clock, including requests that cross the session start/end. A deterministic 500-operation test checks capacity, uniqueness and queue order after each change.

Persistence checks close/reopen storage without reseeding, reload the page, log out/in, expire tokens and create fresh browser contexts. Migration checks verify non-destructive reruns, checksum rejection and transaction rollback. Fault tests simulate lost accepted responses, offline reads, a slow poll, malformed/oversized JSON, failed stream cancellation and random code collisions.

Automated accessibility scans run on stable screens with reduced motion. Separate browser checks cover keyboard interaction, reduced-motion handling and layouts. Passing axe is not a claim of complete accessibility certification. Coverage describes executed server source, not every possible behavior or unlimited production load. An injected internal failure deliberately logs `API error Error` while returning safe JSON.

The trusted live audit is separate: `scripts/verify-deployment.mjs` requires an explicit deployed URL, `--test-records` and matching private database configuration. It creates only generated run-scoped records and refuses destructive cleanup if a real member has used one of its audit sessions. It never runs in CI, build or application startup.

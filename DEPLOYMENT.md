# Deployment

**Live website:** https://still-gym.vercel.app

The current deployment is Vercel project `still-gym` under `iamtanish2618-3571s-projects`. Next.js serves the frontend and API on Node 24. Turso resource `still-gym-db` stores all accounts, sessions, bookings and token hashes. Function and database region: Mumbai (`bom1`).

## Configuration

The Turso Marketplace integration injects `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` into the project. Neither variable is public or committed. Pull variables with `vercel env pull .env.local` without printing their contents. The application refuses local file storage on Vercel.

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run db:migrate
npm run admin:create
vercel deploy --prod --skip-domain
# Verify the candidate deployment, then:
vercel promote <verified-deployment-url>
```

Database migrations are explicit, transactional and checksum-tracked. Do not run the optional local demo seed against production. There is no HTTP admin bootstrap, reset or seeding endpoint. Public signup creates members only. Staff accounts are provisioned through the trusted admin CLI.

The GitHub repository is public and commits use `iamtanish2618`’s GitHub-associated identity. Deployment can run from this authenticated CLI checkout. Automatic deployments on GitHub pushes require the owner to connect GitHub as a Vercel login connection; the initial automatic connection attempt reported that this connection was missing.

## Verification status

Initial release: 16 October 2026 from commit `44e5a6c`. Vercel deployment: `dpl_F7E1EWw54AB7bcu1FT11rcREgbJq`.

The public production domain responds without Vercel authentication. Preview URLs retain Vercel’s default protection. Shared-database health passed; both migrations applied. All 23 backend groups, TypeScript and production build passed locally and in [GitHub Actions](https://github.com/iamtanish2618/still-gym/actions/runs/38907960296). Local fresh-database browser verification and 32-request production-build HTTP races passed. The audit against the public production domain also passed:

- 32 simultaneous booking requests: exactly **20 confirmations / 12 conflicts**; measured batch wall time **1,260 ms** in this run (a small correctness check, not a general throughput benchmark).
- FIFO cancellation/promotion, no queue jumping, hidden waiting codes, own-booking privacy and staff authorization.
- Two concurrent check-ins for one active code: exactly one 200 and one 409.
- Browser signup with mismatch validation, Secure/HttpOnly/SameSite cookie, booking/reload/cancellation, logout and case-insensitive username login. No browser exceptions.
- Generated audit records were removed using their unique run-specific identities. No demo users or sessions were left in production.

Operator-only repeat: `CHROME_CHANNEL=chrome node --env-file-if-exists=.env.local scripts/verify-deployment.mjs https://still-gym.vercel.app --test-records`. This needs the matching remote database configuration, creates temporary records and removes only that run’s records. It never runs during startup, build or normal requests.

## Historical hosting attempt

The earlier optional Sites/Cloudflare deployment failed in its migration runner before going live. Vercel replaces that hosting path; it preserves the complete SQL triggers rather than weakening booking guarantees to fit the earlier runner.

## Admin member-mode update — 16 October 2026

Code commit: `e4ff35c`. Deployment: `dpl_6xjGcJhGw23PqdVRCRJ1Q9sa5doT`, promoted to https://still-gym.vercel.app.

All 24 backend groups, TypeScript and build passed, including [GitHub CI](https://github.com/iamtanish2618/still-gym/actions/runs/38911795189). The new local browser test verified keyboard switching, personal booking/cancellation/reload, return to staff tools, 360/768/1280 layouts, hidden controls for members and server-side staff restrictions. Slow-network booking regressions also passed.

The deployed browser audit confirmed the admin-only switch and same-account booking/cancellation with the database role remaining admin. Members saw no switch. The deployed 32-request race still returned 20 confirmations and 12 conflicts, FIFO held and concurrent check-in succeeded once. Generated audit records were removed; existing accounts, sessions and bookings were preserved.

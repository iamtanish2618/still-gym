# Deployment

The current target is Vercel project `still-gym` under `iamtanish2618-3571s-projects`. Next.js serves the frontend and API on Node 24. Turso resource `still-gym-db` stores all accounts, sessions, bookings and token hashes. Function and database region: Mumbai (`bom1`).

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

The shared database has been provisioned and both migrations applied successfully. Local fresh-database browser verification passed. Live URL and deployed verification results will be recorded here after deployment.

## Historical hosting attempt

The earlier optional Sites/Cloudflare deployment failed in its migration runner before going live. Vercel replaces that hosting path; it preserves the complete SQL triggers rather than weakening booking guarantees to fit the earlier runner.

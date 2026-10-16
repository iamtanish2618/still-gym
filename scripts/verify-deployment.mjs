// Trusted operator verification only; never runs on app startup or build.
import { createAuditContext } from "./audit/context.mjs";
import { verifyApi } from "./audit/api.mjs";
import { verifyBrowser } from "./audit/browser.mjs";
import { cleanupAudit } from "./audit/cleanup.mjs";
const base = process.argv[2];
if (
  !/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(base || "") ||
  !process.argv.includes("--test-records")
)
  throw Error(
    "Supply the exact Vercel deployment URL and --test-records. This writes generated audit records and cleans up only those records.",
  );
if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN)
  throw Error("The matching remote database configuration is required.");
const context = await createAuditContext(base);
let failure;
try {
  const sessions = await verifyApi(context);
  await verifyBrowser({ ...context, ...sessions });
} catch (error) {
  failure = error;
}
try {
  await cleanupAudit(context);
} catch (error) {
  failure = failure
    ? new AggregateError([failure, error], "Verification and cleanup failed.")
    : error;
} finally {
  context.db.client.close();
}
if (failure) throw failure;

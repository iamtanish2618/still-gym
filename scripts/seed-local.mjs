import { seed } from "../tests/fixtures/demo-seed.mjs";
import { getDatabase } from "../server/database.mjs";
if (process.env.VERCEL || process.env.TURSO_DATABASE_URL)
  throw Error(
    "Demo fixtures are local-only. Refusing to seed a hosted database.",
  );
const db = await getDatabase();
try {
  await seed(db, { password: process.env.DEMO_PASSWORD || "StillDemo2026!" });
  console.log(
    "Optional reviewer fixtures created in the empty local database.",
  );
} finally {
  db.client.close();
}

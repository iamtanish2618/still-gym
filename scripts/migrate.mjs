import { getDatabase } from "../server/database.mjs";
import { applyMigrations } from "./lib/migrations.mjs";
const db = await getDatabase();
try {
  await applyMigrations(db);
} finally {
  db.client.close();
}

import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
// A migration and its checksum enter storage in the same write transaction.
export async function applyMigrations(
  db,
  { directory = "drizzle", log = console.log } = {},
) {
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS _still_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)",
    )
    .run();
  for (const name of (await readdir(directory))
    .filter((x) => /^\d+.*\.sql$/.test(x))
    .sort()) {
    const sql = await readFile(`${directory}/${name}`, "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const applied = await db
      .prepare("SELECT checksum FROM _still_migrations WHERE name=?")
      .bind(name)
      .first();
    if (applied) {
      if (applied.checksum !== checksum)
        throw Error(
          `Applied migration ${name} was modified. Refusing to continue.`,
        );
      continue;
    }
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => db.prepare(s));
    statements.push(
      db
        .prepare("INSERT INTO _still_migrations(name,checksum) VALUES(?,?)")
        .bind(name, checksum),
    );
    await db.batch(statements);
    log(`Applied ${name}`);
  }
  log("Database migrations complete. No accounts or sessions were seeded.");
}

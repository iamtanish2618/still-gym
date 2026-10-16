import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { getDatabase } from "../server/database.mjs";
const db = await getDatabase();
try {
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS _still_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)",
    )
    .run();
  for (const name of (await readdir("drizzle"))
    .filter((x) => /^\d+.*\.sql$/.test(x))
    .sort()) {
    const sql = await readFile(`drizzle/${name}`, "utf8");
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
    console.log(`Applied ${name}`);
  }
  console.log(
    "Database migrations complete. No accounts or sessions were seeded.",
  );
} finally {
  db.client.close();
}

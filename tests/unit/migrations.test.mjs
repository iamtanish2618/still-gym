import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { adaptClient } from "../../server/database.mjs";
import { applyMigrations } from "../../scripts/lib/migrations.mjs";

test("migrations create an empty real database and rerun without losing saved users or sessions", async () => {
  const db = adaptClient(createClient({ url: "file::memory:" }));
  try {
    await applyMigrations(db, { log() {} });
    assert.equal(
      (await db.prepare("SELECT count(*) n FROM _still_migrations").first()).n,
      2,
    );
    assert.equal(
      (await db.prepare("SELECT count(*) n FROM users").first()).n,
      0,
    );
    assert.equal(
      (await db.prepare("SELECT count(*) n FROM sessions").first()).n,
      0,
    );
    await db
      .prepare(
        "INSERT INTO users(name,email,password_hash,role) VALUES('Saved member','saved@test.local','test-only','member')",
      )
      .run();
    const before = await db.prepare("SELECT * FROM users").all();
    await applyMigrations(db, { log() {} });
    assert.deepEqual(await db.prepare("SELECT * FROM users").all(), before);
    assert.equal(
      (await db.prepare("SELECT count(*) n FROM _still_migrations").first()).n,
      2,
    );
  } finally {
    db.client.close();
  }
});
test("changed migration checksums fail closed and a broken new migration rolls back all statements", async () => {
  const directory = await mkdtemp(join(tmpdir(), "still-migrations-"));
  const db = adaptClient(createClient({ url: "file::memory:" }));
  try {
    await cp("drizzle", directory, { recursive: true });
    const options = { directory, log() {} };
    await applyMigrations(db, options);
    const path = join(directory, "0000_shallow_paibok.sql"),
      sql = await readFile(path, "utf8");
    await writeFile(path, sql + "\n-- unexpected edit\n");
    await assert.rejects(applyMigrations(db, options), /was modified/);
    await writeFile(path, sql);
    await writeFile(
      join(directory, "0002_invalid.sql"),
      "CREATE TABLE transient(id INTEGER);\n--> statement-breakpoint\nTHIS IS INVALID SQL;",
    );
    await assert.rejects(applyMigrations(db, options));
    assert.equal(
      await db
        .prepare("SELECT name FROM sqlite_master WHERE name='transient'")
        .first(),
      null,
    );
    assert.equal(
      (await db.prepare("SELECT count(*) n FROM _still_migrations").first()).n,
      2,
    );
  } finally {
    db.client.close();
    await rm(directory, { recursive: true, force: true });
  }
});

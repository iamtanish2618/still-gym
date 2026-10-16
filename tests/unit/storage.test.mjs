import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getDatabase, openDatabase } from "../../server/database.mjs";
const original = { ...process.env };
test("hosted runtime refuses missing credentials and local-file fallback", async () => {
  try {
    process.env.VERCEL = "1";
    for (const [url, token] of [
      ["", ""],
      ["libsql://invalid.example", ""],
      ["file:/tmp/forbidden.db", "not-a-token"],
      ["http://insecure.example", "not-a-token"],
    ]) {
      process.env.TURSO_DATABASE_URL = url;
      process.env.TURSO_AUTH_TOKEN = token;
      await assert.rejects(getDatabase(), /Local file storage is forbidden/);
    }
  } finally {
    process.env = { ...original };
  }
});
test("local storage is persistent, cached per module, and batch failures roll back every statement", async () => {
  const directory = await mkdtemp(join(tmpdir(), "still-storage-"));
  let db;
  try {
    process.env.VERCEL = "";
    process.env.TURSO_DATABASE_URL = "";
    process.env.TURSO_AUTH_TOKEN = "";
    process.env.LOCAL_DATABASE_PATH = join(directory, "nested", "app.db");
    db = await getDatabase();
    assert.equal(await getDatabase(), db);
    await db
      .prepare(
        "CREATE TABLE entries(id INTEGER PRIMARY KEY, value TEXT NOT NULL)",
      )
      .run();
    await db.prepare("INSERT INTO entries VALUES(?,?)").bind(1, "saved").run();
    await assert.rejects(
      db.batch([
        db.prepare("INSERT INTO entries VALUES(?,?)").bind(2, "must roll back"),
        db.prepare("INSERT INTO entries VALUES(?,?)").bind(1, "duplicate"),
      ]),
    );
    assert.equal(
      (await db.prepare("SELECT count(*) n FROM entries").first()).n,
      1,
    );
    assert.equal(
      await db.prepare("SELECT * FROM entries WHERE id=2").first(),
      null,
    );
    db.client.close();
    db = await openDatabase();
    assert.equal(
      (await db.prepare("SELECT value FROM entries WHERE id=1").first()).value,
      "saved",
    );
    assert.equal(
      (await db.prepare("PRAGMA foreign_keys").first()).foreign_keys,
      1,
    );
  } finally {
    db?.client.close();
    process.env = { ...original };
    await rm(directory, { recursive: true, force: true });
  }
});

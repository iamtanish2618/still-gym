import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { adaptClient } from "../../server/database.mjs";
import { handleApi } from "../../server/api.mjs";
import { bookingCode, hashToken } from "../../server/auth.mjs";

test("independent libSQL clients share capacity and atomic FIFO promotion across connections", async () => {
  const dir = await mkdtemp(join(tmpdir(), "still-db-"));
  const clients = Array.from({ length: 4 }, () =>
    createClient({ url: `file:${dir}/audit.db` }),
  );
  const dbs = clients.map(adaptClient),
    db = dbs[0];
  try {
    for (const client of clients) {
      await client.execute("PRAGMA foreign_keys=ON");
      await client.execute("PRAGMA busy_timeout=10000");
    }
    for (const name of ["0000_shallow_paibok.sql", "0001_usernames.sql"]) {
      const sql = await readFile(
        new URL(`../../drizzle/${name}`, import.meta.url),
        "utf8",
      );
      await db.batch(
        sql
          .split("--> statement-breakpoint")
          .filter((x) => x.trim())
          .map((sql) => db.prepare(sql)),
      );
    }
    const start =
      Math.floor((Date.now() + 19800000) / 3600000) * 3600000 -
      19800000 +
      86400000;
    await db
      .prepare(
        "INSERT INTO sessions(id,start,title) VALUES(1,?,'Concurrency audit')",
      )
      .bind(start)
      .run();
    const tokens = [];
    for (let i = 0; i < 33; i++) {
      const token = crypto.randomUUID().replaceAll("-", "").repeat(2);
      tokens.push(token);
      await db.batch([
        db
          .prepare(
            "INSERT INTO users(id,name,email,password_hash,role) VALUES(?,?,?,'unused','member')",
          )
          .bind(i + 1, `Audit ${i}`, `audit${i}@test.local`),
        db
          .prepare("INSERT INTO tokens(hash,user_id,expires_at) VALUES(?,?,?)")
          .bind(await hashToken(token), i + 1, Date.now() + 60000),
      ]);
    }
    const call = async (i, path, method = "POST") =>
      handleApi(
        new Request("https://gym.example/api" + path, {
          method,
          headers: {
            Authorization: "Bearer " + tokens[i],
            "Content-Type": "application/json",
          },
          ...(method === "POST" ? { body: "{}" } : {}),
        }),
        dbs[i % 4],
      );
    const results = await Promise.all(
      tokens.slice(0, 32).map((_, i) => call(i, "/sessions/1/book")),
    );
    assert.equal(
      results.filter((r) => r.status === 201).length,
      20,
      JSON.stringify(
        await Promise.all(
          results.map(async (r) => [r.status, await r.clone().json()]),
        ),
      ),
    );
    assert.equal(results.filter((r) => r.status === 409).length, 12);
    const losers = results
      .map((r, i) => (r.status === 409 ? i : -1))
      .filter((i) => i >= 0);
    const queued = [];
    for (const i of losers.slice(0, 3)) {
      const r = await call(i, "/sessions/1/waitlist");
      assert.equal(r.status, 201);
      queued.push((await r.json()).booking);
    }
    const winner = results.findIndex((r) => r.status === 201);
    const booking = (await (await call(winner, "/bookings", "GET")).json())
      .bookings[0];
    const race = await Promise.all([
      call(winner, `/bookings/${booking.id}`, "DELETE"),
      call(32, "/sessions/1/book"),
    ]);
    assert.equal(race[0].status, 200);
    assert.equal(race[1].status, 409);
    assert.equal(
      (
        await db
          .prepare("SELECT status FROM bookings WHERE id=?")
          .bind(queued[0].id)
          .first()
      ).status,
      "confirmed",
    );
    assert.equal(
      (
        await db
          .prepare("SELECT count(*) n FROM bookings WHERE status='confirmed'")
          .first()
      ).n,
      20,
    );
    assert.equal(
      (
        await db
          .prepare("SELECT count(*) n FROM bookings WHERE status='waitlisted'")
          .first()
      ).n,
      2,
    );
    // Two different members race for the final mat; exactly one succeeds.
    await db
      .prepare(
        "INSERT INTO sessions(id,start,title) VALUES(2,?,'Final mat race'),(3,?,'Duplicate click race')",
      )
      .bind(start + 3600000, start + 7200000)
      .run();
    for (let i = 0; i < 19; i++)
      await db
        .prepare(
          "INSERT INTO bookings(user_id,session_id,status,code,created_at) VALUES(?,2,'confirmed',?,?)",
        )
        .bind(i + 1, bookingCode(), Date.now())
        .run();
    const finalMat = await Promise.all([
      call(19, "/sessions/2/book"),
      call(20, "/sessions/2/book"),
    ]);
    assert.deepEqual(finalMat.map((r) => r.status).sort(), [201, 409]);
    assert.equal(
      (
        await db
          .prepare(
            "SELECT count(*) n FROM bookings WHERE session_id=2 AND status='confirmed'",
          )
          .first()
      ).n,
      20,
    );
    const doubleClick = await Promise.all([
      call(21, "/sessions/3/book"),
      call(21, "/sessions/3/book"),
    ]);
    assert.deepEqual(doubleClick.map((r) => r.status).sort(), [201, 409]);
    assert.equal(
      (
        await db
          .prepare("SELECT count(*) n FROM bookings WHERE session_id=3")
          .first()
      ).n,
      1,
    );
  } finally {
    clients.forEach((c) => c.close());
    await rm(dir, { recursive: true, force: true });
  }
});

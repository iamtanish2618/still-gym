import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { adaptClient } from "../../server/database.mjs";
import { handleApi } from "../../server/api.mjs";
import { adminStatement } from "../../scripts/create-admin.mjs";
import { bookingCode, hashToken } from "../../server/auth.mjs";

test("bookings, waitlist positions and staff-created sessions survive logout, expiry, fresh login and reopening storage", async () => {
  const dir = await mkdtemp(join(tmpdir(), "still-persistence-"));
  const url = `file:${dir}/persistent.db`;
  let db = adaptClient(createClient({ url, intMode: "number" }));
  const call = async (path, { cookie, method = "GET", body } = {}) => {
    const r = await handleApi(
      new Request("https://gym.example/api" + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          Origin: "https://gym.example",
          "X-Still-Client": "browser",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      db,
    );
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
    };
  };
  const password = randomBytes(24).toString("base64url");
  const memberInput = {
    name: "Persistence Member",
    username: "persist_member",
    email: "persist@example.org",
    password,
  };
  const owner = {
    name: "Persistence Owner",
    email: "owner@example.org",
    password,
  };
  const login = async (email) => {
    const result = await call("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    assert.equal(result.status, 200);
    assert.ok(result.cookie);
    return result.cookie;
  };
  try {
    await db.client.execute("PRAGMA foreign_keys=ON");
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
    await db.prepare(await adminStatement(owner)).run();
    const staffCookie = await login(owner.email);
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(Date.now() + 2 * 86400000);
    const sessions = [];
    for (const hour of [9, 10]) {
      const created = await call("/sessions", {
        cookie: staffCookie,
        method: "POST",
        body: { date, hour, title: `Persistent session ${hour}` },
      });
      assert.equal(created.status, 201);
      sessions.push(created.data.session);
    }
    const signup = await call("/auth/register", {
      method: "POST",
      body: memberInput,
    });
    assert.equal(signup.status, 201);
    const originalCookie = signup.cookie;
    const booked = await call(`/sessions/${sessions[0].id}/book`, {
      cookie: originalCookie,
      method: "POST",
      body: {},
    });
    assert.equal(booked.status, 201);
    assert.ok(booked.data.booking.code);
    for (let i = 0; i < 20; i++) {
      const fixture = await db
        .prepare(
          "INSERT INTO users(name,email,password_hash,role) VALUES(?,?,'unused','member') RETURNING id",
        )
        .bind(`Fixture ${i}`, `fixture${i}@test.local`)
        .first();
      await db
        .prepare(
          "INSERT INTO bookings(user_id,session_id,status,code,created_at) VALUES(?,?,'confirmed',?,?)",
        )
        .bind(fixture.id, sessions[1].id, bookingCode(), Date.now())
        .run();
    }
    const queue = await call(`/sessions/${sessions[1].id}/waitlist`, {
      cookie: originalCookie,
      method: "POST",
      body: {},
    });
    assert.equal(queue.status, 201);
    assert.equal(queue.data.booking.code, null);
    assert.equal(queue.data.booking.position, 1);
    const ownBefore = (await call("/bookings", { cookie: originalCookie })).data
      .bookings;
    const storedBefore = (
      await db.prepare("SELECT * FROM bookings ORDER BY id").all()
    ).results;
    const sessionsBefore = (
      await db.prepare("SELECT * FROM sessions ORDER BY id").all()
    ).results;
    assert.equal(
      (
        await call("/auth/logout", {
          cookie: originalCookie,
          method: "POST",
          body: {},
        })
      ).status,
      200,
    );
    assert.equal(
      (await call("/bookings", { cookie: originalCookie })).status,
      401,
    );
    assert.equal(
      (
        await call("/auth/logout", {
          cookie: staffCookie,
          method: "POST",
          body: {},
        })
      ).status,
      200,
    );
    db.client.close();
    db = adaptClient(createClient({ url, intMode: "number" }));
    await db.client.execute("PRAGMA foreign_keys=ON");
    // No migration, seed, browser storage or in-memory identity is restored here.
    const freshCookie = await login(memberInput.username);
    assert.notEqual(freshCookie, originalCookie);
    assert.deepEqual(
      (await call("/bookings", { cookie: freshCookie })).data.bookings,
      ownBefore,
    );
    assert.equal(
      (
        await call(`/sessions/${sessions[0].id}/book`, {
          cookie: freshCookie,
          method: "POST",
          body: {},
        })
      ).status,
      409,
    );
    const rawToken = freshCookie.split("=")[1];
    await db
      .prepare("UPDATE tokens SET expires_at=0 WHERE hash=?")
      .bind(await hashToken(rawToken))
      .run();
    assert.equal(
      (await call("/bookings", { cookie: freshCookie })).status,
      401,
    );
    const afterExpiry = await login(memberInput.email);
    assert.deepEqual(
      (await call("/bookings", { cookie: afterExpiry })).data.bookings,
      ownBefore,
    );
    const freshStaff = await login(owner.email);
    const listing = await call(`/sessions?date=${date}`, {
      cookie: freshStaff,
    });
    assert.equal(listing.data.sessions.length, 2);
    for (const session of sessions)
      assert.ok(
        listing.data.sessions.some(
          (s) => s.id === session.id && s.title === session.title,
        ),
      );
    assert.deepEqual(
      (await db.prepare("SELECT * FROM bookings ORDER BY id").all()).results,
      storedBefore,
    );
    assert.deepEqual(
      (await db.prepare("SELECT * FROM sessions ORDER BY id").all()).results,
      sessionsBefore,
    );
  } finally {
    db.client.close();
    await rm(dir, { recursive: true, force: true });
  }
});

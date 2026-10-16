import { test } from "node:test";
import assert from "node:assert/strict";
import { database, migrate } from "./database.mjs";
import { handleApi } from "../server/api.mjs";
import {
  hashToken,
  randomToken,
  passwordHash,
  verifyPassword,
} from "../server/auth.mjs";

test("request bodies are bounded by bytes while streaming, reject invalid UTF-8, and require the JSON media type", async () => {
  const db = database();
  migrate(db);
  try {
    const request = (body, headers = {}) =>
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body,
        ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
      });
    const error = async (r) => ({
      status: r.status,
      code: (await r.json()).error.code,
    });
    let cancelled = false;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(8193).fill(32));
      },
      cancel() {
        cancelled = true;
      },
    });
    assert.deepEqual(await error(await handleApi(request(stream), db)), {
      status: 400,
      code: "BODY_TOO_LARGE",
    });
    assert.ok(cancelled);
    assert.deepEqual(
      await error(
        await handleApi(request("{}", { "Content-Length": "9000" }), db),
      ),
      { status: 400, code: "BODY_TOO_LARGE" },
    );
    assert.deepEqual(
      await error(
        await handleApi(
          request(JSON.stringify({ name: "界".repeat(3000) })),
          db,
        ),
      ),
      { status: 400, code: "BODY_TOO_LARGE" },
    );
    assert.deepEqual(
      await error(await handleApi(request(new Uint8Array([0xff])), db)),
      { status: 400, code: "INVALID_JSON" },
    );
    assert.deepEqual(
      await error(
        await handleApi(
          request("{}", { "Content-Type": "text/application/json-fake" }),
          db,
        ),
      ),
      { status: 400, code: "JSON_REQUIRED" },
    );
    const legitimate = await handleApi(
      request(
        JSON.stringify({
          email: "missing@test.local",
          password: "CorrectLength2026!",
        }),
        { "Content-Type": "Application/JSON; charset=utf-8" },
      ),
      db,
    );
    assert.equal(legitimate.status, 401);
  } finally {
    db.sqlite.close();
  }
});
test("real unique-code collisions retry safely and stop after three attempts without duplicate reservations", async () => {
  const db = database();
  migrate(db);
  try {
    const tokens = [];
    for (let i = 1; i <= 3; i++) {
      db.sqlite
        .prepare(
          "INSERT INTO users(id,name,email,password_hash,role) VALUES(?,?,?,'unused','member')",
        )
        .run(i, "Collision tester " + i, `collision${i}@test.local`);
      const token = randomToken();
      tokens.push(token);
      db.sqlite
        .prepare("INSERT INTO tokens(hash,user_id,expires_at) VALUES(?,?,?)")
        .run(await hashToken(token), i, Date.now() + 3600000);
    }
    const start =
      Math.floor((Date.now() + 19800000) / 3600000) * 3600000 -
      19800000 +
      86400000;
    db.sqlite.prepare("INSERT INTO sessions(id,start) VALUES(1,?)").run(start);
    const call = (user, database = db) =>
      handleApi(
        new Request("http://localhost/api/sessions/1/book", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + tokens[user - 1],
          },
          body: "{}",
        }),
        database,
      );
    const first = await call(1);
    assert.equal(first.status, 201);
    const code = (await first.json()).booking.code;
    function collisionDatabase(failures) {
      let attempts = 0;
      return {
        get attempts() {
          return attempts;
        },
        prepare(sql) {
          const statement = db.prepare(sql);
          if (!sql.startsWith("INSERT INTO bookings")) return statement;
          return {
            bind(...args) {
              attempts++;
              if (attempts <= failures) args[3] = code;
              return statement.bind(...args);
            },
          };
        },
      };
    }
    const twice = collisionDatabase(2);
    assert.equal((await call(2, twice)).status, 201);
    assert.equal(twice.attempts, 3);
    const always = collisionDatabase(Infinity);
    const unavailable = await call(3, always);
    assert.equal(unavailable.status, 503);
    assert.equal((await unavailable.json()).error.code, "CODE_UNAVAILABLE");
    assert.equal(always.attempts, 3);
    const rows = db.sqlite.prepare("SELECT * FROM bookings").all();
    assert.equal(rows.length, 2);
    assert.equal(new Set(rows.map((x) => x.code)).size, 2);
    const duplicate = collisionDatabase(0);
    assert.equal((await call(1, duplicate)).status, 409);
    assert.equal(
      duplicate.attempts,
      1,
      "A member conflict must never be retried",
    );
  } finally {
    db.sqlite.close();
  }
});
test("malformed password records fail closed without throwing or accepting truncated hashes", async () => {
  for (const stored of [
    null,
    undefined,
    123,
    "unused",
    "pbkdf2-sha256$100000$broken$hash",
    "pbkdf2-sha256$999999999999$" + "a".repeat(32) + "$" + "b".repeat(64),
  ])
    assert.equal(await verifyPassword("CorrectLength2026!", stored), false);
  const hash = await passwordHash("CorrectLength2026!");
  assert.equal(await verifyPassword("CorrectLength2026!", hash), true);
  assert.equal(await verifyPassword("WrongPassword2026!", hash), false);
  assert.equal(
    await verifyPassword("CorrectLength2026!", hash.slice(0, -1)),
    false,
  );
});

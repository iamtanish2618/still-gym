import { test } from "node:test";
import assert from "node:assert/strict";
import { database, migrate } from "./database.mjs";
import { handleApi } from "../server/api.mjs";
import { seed } from "./fixtures/demo-seed.mjs";
import { bookingCode, hashToken, passwordHash } from "../server/auth.mjs";
const db = database();
migrate(db);
await seed(db);
const call = async (path, { token, method = "GET", body } = {}) => {
  const r = await handleApi(
    new Request("http://localhost/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    db,
  );
  return { status: r.status, data: await r.json() };
};
const login = async (email) =>
  (
    await call("/auth/login", {
      method: "POST",
      body: { email, password: "StillDemo2026!" },
    })
  ).data.token;
const admin = await login("admin@still.demo"),
  aanya = await login("aanya@still.demo"),
  kabir = await login("kabir@still.demo");
const future =
  Math.floor((Date.now() + 19800000) / 86400000) * 86400000 -
  19800000 +
  8 * 86400000;
const session = (id) =>
  db.sqlite
    .prepare("INSERT INTO sessions(id,start,title) VALUES(?,?,?)")
    .run(id, future + (id - 100) * 3600000, "Test session");
async function userToken(i) {
  const user = db.sqlite
    .prepare(
      "INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'member') RETURNING id",
    )
    .get(`Racer ${i}`, `race${i}@test.local`, "unused");
  const token = crypto.randomUUID().replaceAll("-", "").repeat(2);
  db.sqlite
    .prepare("INSERT INTO tokens(hash,user_id,expires_at) VALUES(?,?,?)")
    .run(await hashToken(token), user.id, Date.now() + 3600000);
  return { token, id: user.id };
}
const racers = await Promise.all(
  Array.from({ length: 32 }, (_, i) => userToken(i)),
);
test("registration normalizes unique email, hashes passwords, never grants admin", async () => {
  const good = {
    name: "Test member",
    username: "test_member",
    email: " TEST@example.org ",
    password: "TestPassword123",
  };
  assert.equal(
    (
      await call("/auth/register", {
        method: "POST",
        body: { ...good, role: "admin" },
      })
    ).status,
    403,
  );
  const r = await call("/auth/register", { method: "POST", body: good });
  assert.equal(r.status, 201);
  assert.equal(r.data.user.role, "member");
  assert.equal(r.data.user.email, "test@example.org");
  assert.notEqual(
    db.sqlite
      .prepare("SELECT password_hash FROM users WHERE id=?")
      .get(r.data.user.id).password_hash,
    good.password,
  );
  assert.equal(
    (await call("/auth/register", { method: "POST", body: good })).status,
    409,
  );
  assert.equal(
    (
      await call("/auth/register", {
        method: "POST",
        body: { name: "", email: "bad", password: "x" },
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await call("/auth/login", {
        method: "POST",
        body: { email: good.email, password: "WrongPassword123" },
      })
    ).status,
    401,
  );
});
test("authentication, role checks, ownership, expiry and logout", async () => {
  assert.equal((await call("/sessions")).status, 401);
  assert.equal(
    (await call("/sessions", { token: aanya, method: "POST", body: {} }))
      .status,
    403,
  );
  assert.equal(
    (await call("/sessions/1/bookings", { token: aanya })).status,
    403,
  );
  const own = (await call("/bookings", { token: aanya })).data.bookings;
  assert.ok(own.length >= 2);
  assert.ok(!JSON.stringify(own).includes("kabir"));
  assert.equal(
    (await call("/bookings/" + own[0].id, { token: kabir, method: "DELETE" }))
      .status,
    404,
  );
  const temp = await login("kabir@still.demo");
  assert.equal(
    (await call("/auth/logout", { token: temp, method: "POST", body: {} }))
      .status,
    200,
  );
  assert.equal((await call("/auth/me", { token: temp })).status, 401);
  const expired = await login("kabir@still.demo");
  db.sqlite
    .prepare("UPDATE tokens SET expires_at=0 WHERE hash=?")
    .run(await hashToken(expired));
  assert.equal((await call("/auth/me", { token: expired })).status, 401);
});
test("admin session validation, capacity and unique hours", async () => {
  const date = new Date(future + 19800000).toISOString().slice(0, 10),
    body = { date, hour: 7, title: "Practice" };
  assert.equal(
    (
      await call("/sessions", {
        token: admin,
        method: "POST",
        body: { ...body, capacity: 21 },
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await call("/sessions", {
        token: admin,
        method: "POST",
        body: { ...body, hour: 7.5 },
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await call("/sessions", {
        token: admin,
        method: "POST",
        body: { ...body, date: "2026-02-31" },
      })
    ).status,
    422,
  );
  assert.equal(
    (await call("/sessions", { token: admin, method: "POST", body })).status,
    201,
  );
  assert.equal(
    (await call("/sessions", { token: admin, method: "POST", body })).status,
    409,
  );
  assert.equal(
    (await call("/sessions?date=invalid", { token: aanya })).status,
    422,
  );
});
test("32 simultaneous booking requests yield exactly 20 confirmations", async () => {
  session(100);
  const results = await Promise.all(
    racers.map((r) =>
      call("/sessions/100/book", { token: r.token, method: "POST", body: {} }),
    ),
  );
  assert.equal(results.filter((r) => r.status === 201).length, 20);
  assert.equal(results.filter((r) => r.status === 409).length, 12);
  assert.equal(
    db.sqlite
      .prepare(
        "SELECT count(*) n FROM bookings WHERE session_id=100 AND status='confirmed'",
      )
      .get().n,
    20,
  );
  assert.ok(
    results
      .filter((r) => r.status === 201)
      .every((r) => /^[A-HJ-NP-Z2-9]{8}$/.test(r.data.booking.code)),
  );
});
test("duplicate prevention, FIFO promotion, leave waitlist and rebooking", async () => {
  const winners = db.sqlite
    .prepare(
      "SELECT * FROM bookings WHERE session_id=100 AND status='confirmed' ORDER BY id",
    )
    .all();
  assert.equal(
    (
      await call("/sessions/100/book", {
        token: racers[0].token,
        method: "POST",
        body: {},
      })
    ).status,
    409,
  );
  const one = await call("/sessions/100/waitlist", {
      token: racers[20].token,
      method: "POST",
      body: {},
    }),
    two = await call("/sessions/100/waitlist", {
      token: racers[21].token,
      method: "POST",
      body: {},
    });
  assert.equal(one.data.booking.position, 1);
  assert.equal(two.data.booking.position, 2);
  assert.equal(one.data.booking.code, null);
  assert.equal(
    (
      await call("/sessions/100/waitlist", {
        token: racers[20].token,
        method: "POST",
        body: {},
      })
    ).status,
    409,
  );
  const owner = racers.find((r) => r.id === winners[0].user_id);
  assert.equal(
    (
      await call("/bookings/" + winners[0].id, {
        token: owner.token,
        method: "DELETE",
      })
    ).status,
    200,
  );
  const promoted = (
    await call("/bookings", { token: racers[20].token })
  ).data.bookings.find((b) => b.session_id === 100);
  assert.equal(promoted.status, "confirmed");
  assert.ok(promoted.code);
  assert.equal(
    (await call("/bookings", { token: racers[21].token })).data.bookings.find(
      (b) => b.session_id === 100,
    ).position,
    1,
  );
  assert.equal(
    (
      await call("/bookings/" + two.data.booking.id, {
        token: racers[21].token,
        method: "DELETE",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("/bookings/" + promoted.id, {
        token: racers[20].token,
        method: "DELETE",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("/sessions/100/book", {
        token: owner.token,
        method: "POST",
        body: {},
      })
    ).status,
    201,
  );
  assert.equal(
    db.sqlite
      .prepare(
        "SELECT count(*) n FROM bookings WHERE session_id=100 AND status='confirmed'",
      )
      .get().n,
    20,
  );
});
test("waitlist only when full, no new booking/cancellation/promotion after start", async () => {
  session(101);
  assert.equal(
    (
      await call("/sessions/101/waitlist", {
        token: aanya,
        method: "POST",
        body: {},
      })
    ).status,
    409,
  );
  const b = await call("/sessions/101/book", {
    token: aanya,
    method: "POST",
    body: {},
  });
  assert.equal(b.status, 201);
  // Move a test session into the past directly, as if time elapsed.
  const start =
    Math.floor((Date.now() + 19800000) / 3600000) * 3600000 -
    19800000 -
    3600000;
  db.sqlite.prepare("UPDATE sessions SET start=? WHERE id=101").run(start);
  assert.equal(
    (
      await call("/sessions/101/book", {
        token: kabir,
        method: "POST",
        body: {},
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call("/bookings/" + b.data.booking.id, {
        token: aanya,
        method: "DELETE",
      })
    ).status,
    409,
  );
  const waiting = await call("/sessions/100/waitlist", {
    token: racers[22].token,
    method: "POST",
    body: {},
  });
  assert.equal(waiting.status, 201);
  db.sqlite
    .prepare("UPDATE sessions SET start=? WHERE id=100")
    .run(start - 3600000);
  const victim = db.sqlite
    .prepare(
      "SELECT id FROM bookings WHERE session_id=100 AND status='confirmed' LIMIT 1",
    )
    .get();
  db.sqlite
    .prepare("UPDATE bookings SET status='cancelled' WHERE id=?")
    .run(victim.id);
  assert.equal(
    db.sqlite
      .prepare("SELECT status FROM bookings WHERE id=?")
      .get(waiting.data.booking.id).status,
    "waitlisted",
  );
});
test("check-in once, only staff, only during hour, never cancelled", async () => {
  const active = (await call("/bookings", { token: aanya })).data.bookings.find(
    (b) => b.session_id === 1,
  );
  assert.equal(
    (
      await call("/check-in", {
        token: aanya,
        method: "POST",
        body: { code: active.code },
      })
    ).status,
    403,
  );
  const futureBooking = (
    await call("/bookings", { token: aanya })
  ).data.bookings.find((b) => b.session_id === 2);
  assert.equal(
    (
      await call("/check-in", {
        token: admin,
        method: "POST",
        body: { code: futureBooking.code },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call("/check-in", {
        token: admin,
        method: "POST",
        body: { code: active.code },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("/check-in", {
        token: admin,
        method: "POST",
        body: { code: active.code },
      })
    ).status,
    409,
  );
  db.sqlite
    .prepare("UPDATE bookings SET status='cancelled' WHERE id=?")
    .run(active.id);
  assert.equal(
    (
      await call("/check-in", {
        token: admin,
        method: "POST",
        body: { code: active.code },
      })
    ).status,
    409,
  );
});
test("malformed inputs and unexpected errors use consistent safe JSON", async () => {
  const malformed = await handleApi(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    }),
    db,
  );
  assert.equal(malformed.status, 400);
  assert.ok((await malformed.json()).error.message);
  assert.equal(
    (
      await call("/sessions/nope/book", {
        token: aanya,
        method: "POST",
        body: {},
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/sessions/999999/book", {
        token: aanya,
        method: "POST",
        body: {},
      })
    ).status,
    404,
  );
  const failure = await handleApi(new Request("http://localhost/api/health"), {
    prepare() {
      throw Error("secret stack details");
    },
  });
  assert.equal(failure.status, 500);
  assert.ok(!JSON.stringify(await failure.json()).includes("secret"));
});
test("cryptographic codes have valid alphabet and no collisions in sample", () => {
  const values = Array.from({ length: 1000 }, bookingCode);
  assert.equal(new Set(values).size, 1000);
  assert.ok(values.every((v) => /^[A-HJ-NP-Z2-9]{8}$/.test(v)));
});
test("password hashes are salted", async () =>
  assert.notEqual(
    await passwordHash("SamePassword123"),
    await passwordHash("SamePassword123"),
  ));

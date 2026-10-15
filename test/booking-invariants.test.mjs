import { test } from "node:test";
import assert from "node:assert/strict";
import { database, migrate } from "./database.mjs";
import { handleApi } from "../server/api.mjs";
import { hashToken, randomToken } from "../server/auth.mjs";

async function fixture(size = 36) {
  const db = database();
  migrate(db);
  let clock = Math.floor(Date.now() / 1000);
  db.sqlite.function("unixepoch", () => clock);
  const start =
    Math.floor((Date.now() + 19800000) / 3600000) * 3600000 -
    19800000 +
    7 * 86400000;
  db.sqlite
    .prepare("INSERT INTO sessions(id,start,title) VALUES(1,?,?)")
    .run(start, "Invariant session");
  const users = [];
  for (let i = 0; i <= size; i++) {
    const role = i === 0 ? "admin" : "member";
    const u = db.sqlite
      .prepare(
        "INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?) RETURNING id",
      )
      .get("Test " + i, `member${i}@test.local`, "not-used", role);
    const token = randomToken();
    db.sqlite
      .prepare("INSERT INTO tokens(hash,user_id,expires_at) VALUES(?,?,?)")
      .run(await hashToken(token), u.id, Date.now() + 86400000);
    users.push({ id: u.id, token });
  }
  async function call(path, user = 1, method = "GET", body) {
    const r = await handleApi(
      new Request("http://localhost/api" + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + users[user].token,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
      db,
    );
    return { status: r.status, data: await r.json() };
  }
  const book = (u, kind = "book") => call("/sessions/1/" + kind, u, "POST", {});
  const cancel = (id, u) => call("/bookings/" + id, u, "DELETE");
  const row = (id) =>
    db.sqlite.prepare("SELECT * FROM bookings WHERE id=?").get(id);
  const counts = () =>
    db.sqlite
      .prepare(
        "SELECT status,count(*) n FROM bookings WHERE session_id=1 GROUP BY status",
      )
      .all();
  return {
    db,
    start,
    users,
    call,
    book,
    cancel,
    row,
    counts,
    setClock: (ms) => {
      clock = Math.floor(ms / 1000);
    },
    close: () => db.sqlite.close(),
  };
}

test("exact session boundaries enforce booking, cancellation and check-in at database execution time", async () => {
  const f = await fixture(4);
  try {
    f.setClock(f.start - 1000);
    const a = await f.book(1),
      b = await f.book(2);
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    assert.equal(
      (await f.call("/check-in", 0, "POST", { code: a.data.booking.code }))
        .status,
      409,
    );
    assert.equal((await f.cancel(b.data.booking.id, 2)).status, 200);
    assert.equal((await f.book(2)).status, 201);
    f.setClock(f.start);
    assert.equal((await f.book(3)).status, 409);
    assert.equal((await f.cancel(a.data.booking.id, 1)).status, 409);
    const check = await Promise.all([
      f.call("/check-in", 0, "POST", { code: a.data.booking.code }),
      f.call("/check-in", 0, "POST", { code: a.data.booking.code }),
    ]);
    assert.deepEqual(check.map((r) => r.status).sort(), [200, 409]);
    const code = (await f.call("/bookings", 2)).data.bookings.find(
      (b) => b.status === "confirmed",
    ).code;
    f.setClock(f.start + 3600000);
    assert.equal((await f.call("/check-in", 0, "POST", { code })).status, 409);
    assert.equal(f.row(a.data.booking.id).status, "confirmed");
  } finally {
    f.close();
  }
});

test("a request crossing the start/end boundary cannot use a stale application clock", async () => {
  const f = await fixture(3);
  try {
    f.setClock(f.start - 1000);
    const b = await f.book(1);
    const original = f.db.prepare;
    let intercept = "INSERT INTO bookings";
    f.db.prepare = (sql) => {
      const statement = original(sql);
      return {
        ...statement,
        bind(...args) {
          const bound = statement.bind(...args);
          return {
            ...bound,
            async first() {
              if (sql.includes(intercept))
                f.setClock(
                  intercept.startsWith("UPDATE bookings SET checked")
                    ? f.start + 3600000
                    : f.start,
                );
              return bound.first();
            },
          };
        },
      };
    };
    assert.equal((await f.book(2)).status, 409);
    f.setClock(f.start - 1000);
    intercept = "UPDATE bookings SET status='cancelled'";
    assert.equal((await f.cancel(b.data.booking.id, 1)).status, 409);
    f.setClock(f.start);
    intercept = "UPDATE bookings SET checked_in_at";
    assert.equal(
      (await f.call("/check-in", 0, "POST", { code: b.data.booking.code }))
        .status,
      409,
    );
    assert.equal(f.row(b.data.booking.id).checked_in_at, null);
  } finally {
    f.close();
  }
});

test("duplicate cancellation cannot release a second mat or promote a second waiting member", async () => {
  const f = await fixture();
  try {
    const confirmed = [];
    for (let i = 1; i <= 20; i++)
      confirmed.push((await f.book(i)).data.booking);
    const first = (await f.book(21, "waitlist")).data.booking,
      second = (await f.book(22, "waitlist")).data.booking;
    const result = await Promise.all([
      f.cancel(confirmed[0].id, 1),
      f.cancel(confirmed[0].id, 1),
    ]);
    assert.deepEqual(result.map((x) => x.status).sort(), [200, 409]);
    assert.equal(f.row(first.id).status, "confirmed");
    assert.equal(f.row(second.id).status, "waitlisted");
    assert.equal(f.counts().find((x) => x.status === "confirmed").n, 20);
    // A queued member leaving concurrently with a cancellation must never strand a free mat.
    const third = (await f.book(23, "waitlist")).data.booking;
    const mixed = await Promise.all([
      f.cancel(second.id, 22),
      f.cancel(confirmed[1].id, 2),
    ]);
    assert.ok(mixed.every((r) => r.status === 200));
    assert.equal(f.row(second.id).status, "cancelled");
    assert.equal(f.row(third.id).status, "confirmed");
    assert.equal(f.counts().find((x) => x.status === "confirmed").n, 20);
    // A fresh request cannot leapfrog a queue entry during cancellation.
    const fourth = (await f.book(24, "waitlist")).data.booking;
    const race = await Promise.all([f.book(25), f.cancel(confirmed[2].id, 3)]);
    assert.equal(race[0].status, 409);
    assert.equal(race[1].status, 200);
    assert.equal(f.row(fourth.id).status, "confirmed");
  } finally {
    f.close();
  }
});

test("retry after a lost booking response keeps one active record; rebooking gets a fresh code", async () => {
  const f = await fixture(3);
  try {
    const b = await f.book(1); // Treat this response as lost by the client.
    const retries = await Promise.all([
      f.book(1),
      f.book(1),
      f.book(1, "waitlist"),
    ]);
    assert.ok(retries.every((r) => r.status === 409));
    const own = (await f.call("/bookings", 1)).data.bookings;
    assert.equal(own.length, 1);
    assert.equal(own[0].code, b.data.booking.code);
    assert.equal((await f.call("/bookings", 2)).data.bookings.length, 0);
    await f.cancel(b.data.booking.id, 1);
    const again = await f.book(1);
    assert.equal(again.status, 201);
    assert.notEqual(again.data.booking.code, b.data.booking.code);
    f.setClock(f.start);
    assert.equal(
      (await f.call("/check-in", 0, "POST", { code: b.data.booking.code }))
        .status,
      409,
    );
    assert.equal(
      (await f.call("/check-in", 0, "POST", { code: again.data.booking.code }))
        .status,
      200,
    );
  } finally {
    f.close();
  }
});

test("500 deterministic mixed operations preserve capacity, uniqueness, FIFO and queue positions after every change", async () => {
  const f = await fixture();
  try {
    const active = new Map(),
      queue = [];
    let random = 0x7a55cafe;
    const next = () => {
      random ^= random << 13;
      random ^= random >>> 17;
      random ^= random << 5;
      return random >>> 0;
    };
    async function step(user, action) {
      const current = active.get(user),
        confirmed = [...active.values()].filter(
          (x) => x.status === "confirmed",
        ).length;
      if (action === "cancel") {
        if (!current) return;
        assert.equal((await f.cancel(current.id, user)).status, 200);
        active.delete(user);
        if (current.status === "waitlisted")
          queue.splice(queue.indexOf(user), 1);
        else if (queue.length) {
          const promoted = queue.shift();
          active.get(promoted).status = "confirmed";
        }
      } else {
        const allowed =
          !current && (action === "book" ? confirmed < 20 : confirmed === 20);
        const r = await f.book(user, action);
        assert.equal(
          r.status,
          allowed ? 201 : 409,
          `user=${user}, action=${action}`,
        );
        if (allowed) {
          const status = action === "book" ? "confirmed" : "waitlisted";
          active.set(user, { id: r.data.booking.id, status });
          if (status === "waitlisted") queue.push(user);
        }
      }
      const rows = f.db.sqlite
        .prepare("SELECT * FROM bookings WHERE status!='cancelled' ORDER BY id")
        .all();
      assert.equal(
        rows.filter((x) => x.status === "confirmed").length,
        [...active.values()].filter((x) => x.status === "confirmed").length,
      );
      assert.ok(rows.filter((x) => x.status === "confirmed").length <= 20);
      assert.equal(new Set(rows.map((x) => x.user_id)).size, rows.length);
      assert.deepEqual(
        rows.filter((x) => x.status === "waitlisted").map((x) => x.user_id),
        queue.map((u) => f.users[u].id),
      );
      for (const [u, expected] of active) {
        const actual = rows.find((x) => x.user_id === f.users[u].id);
        assert.equal(actual.status, expected.status);
        assert.equal(actual.id, expected.id);
      }
      if (queue.length)
        assert.equal(rows.filter((x) => x.status === "confirmed").length, 20);
    }
    for (let i = 1; i <= 20; i++) await step(i, "book");
    for (let i = 21; i <= 28; i++) await step(i, "waitlist");
    for (let i = 0; i < 500; i++)
      await step(1 + (next() % 36), ["book", "waitlist", "cancel"][next() % 3]);
    for (let i = 0; i < queue.length; i++) {
      const b = (await f.call("/bookings", queue[i])).data.bookings.find(
        (x) => x.status === "waitlisted",
      );
      assert.equal(b.position, i + 1);
      assert.equal(b.code, null);
    }
  } finally {
    f.close();
  }
});

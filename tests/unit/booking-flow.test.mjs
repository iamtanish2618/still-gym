import { test, after } from "node:test";
import assert from "node:assert/strict";
import { apiFixture } from "../helpers/api-fixture.mjs";

const { db, call, aanya, kabir, session, racers } = await apiFixture();
after(() => db.sqlite.close());
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

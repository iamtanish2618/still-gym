import { test, after } from "node:test";
import assert from "node:assert/strict";
import { apiFixture } from "../helpers/api-fixture.mjs";

const { db, call, admin, session, racers } = await apiFixture();
after(() => db.sqlite.close());
test("staff book and cancel their own places without changing roles or granting members staff access", async () => {
  session(777);
  session(778);
  const reserve = await call("/sessions/777/book", {
    token: admin,
    method: "POST",
    body: {},
  });
  assert.equal(reserve.status, 201);
  assert.equal(
    (
      await call("/sessions/777/book", {
        token: admin,
        method: "POST",
        body: {},
      })
    ).status,
    409,
  );
  const other = await call("/sessions/777/book", {
    token: racers[0].token,
    method: "POST",
    body: { role: "admin", mode: "admin" },
  });
  assert.equal(other.status, 201);
  const own = (await call("/bookings", { token: admin })).data.bookings;
  assert.ok(own.some((b) => b.id === reserve.data.booking.id));
  assert.ok(!own.some((b) => b.id === other.data.booking.id));
  assert.equal(
    (
      await call(`/bookings/${other.data.booking.id}`, {
        token: admin,
        method: "DELETE",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await call(`/bookings/${reserve.data.booking.id}`, {
        token: racers[0].token,
        method: "DELETE",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await call(`/bookings/${reserve.data.booking.id}`, {
        token: admin,
        method: "DELETE",
      })
    ).status,
    200,
  );
  const rebook = await call("/sessions/777/book", {
    token: admin,
    method: "POST",
    body: {},
  });
  assert.equal(rebook.status, 201);
  assert.notEqual(rebook.data.booking.code, reserve.data.booking.code);
  for (const racer of racers.slice(0, 20))
    assert.equal(
      (
        await call("/sessions/778/book", {
          token: racer.token,
          method: "POST",
          body: {},
        })
      ).status,
      201,
    );
  const waiting = await call("/sessions/778/waitlist", {
    token: admin,
    method: "POST",
    body: {},
  });
  assert.equal(waiting.status, 201);
  assert.equal(waiting.data.booking.code, null);
  assert.equal(
    (
      await call(`/bookings/${waiting.data.booking.id}`, {
        token: admin,
        method: "DELETE",
      })
    ).status,
    200,
  );
  assert.equal(
    (await call("/auth/me", { token: admin })).data.user.role,
    "admin",
  );
  assert.equal(
    (await call("/auth/me", { token: racers[0].token })).data.user.role,
    "member",
  );
  for (const [path, method, body] of [
    ["/sessions", "POST", { role: "admin" }],
    ["/sessions/777/bookings", "GET"],
    ["/check-in", "POST", { code: rebook.data.booking.code, role: "admin" }],
  ])
    assert.equal(
      (await call(path, { token: racers[0].token, method, body })).status,
      403,
    );
});

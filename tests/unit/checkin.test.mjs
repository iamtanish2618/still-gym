import { test, after } from "node:test";
import assert from "node:assert/strict";
import { apiFixture } from "../helpers/api-fixture.mjs";

const { db, call, admin, aanya } = await apiFixture();
after(() => db.sqlite.close());
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

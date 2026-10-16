import { test, after } from "node:test";
import assert from "node:assert/strict";
import { apiFixture } from "../helpers/api-fixture.mjs";

const { db, call, admin, aanya, future } = await apiFixture();
after(() => db.sqlite.close());
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

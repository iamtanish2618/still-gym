import { test, after } from "node:test";
import assert from "node:assert/strict";
import { apiFixture } from "../helpers/api-fixture.mjs";
import { hashToken } from "../../server/auth.mjs";
const { db, call, admin, aanya } = await apiFixture();
after(() => db.sqlite.close());
async function exhaust(key, count) {
  const bucket = Math.floor(Date.now() / 60000);
  db.sqlite
    .prepare("INSERT INTO rate_limits(key,count,expires_at) VALUES(?,?,?)")
    .run(`${await hashToken(key)}:${bucket}`, count, Date.now() + 120000);
}
test("shared authentication, booking and check-in limits reject excess requests before writes", async () => {
  await exhaust("auth:blocked@test.local", 10);
  const login = await call("/auth/login", {
    method: "POST",
    body: { email: "blocked@test.local", password: "SomePassword123" },
  });
  assert.equal(login.status, 429);
  assert.equal(login.data.error.code, "RATE_LIMITED");
  const member = (await call("/auth/me", { token: aanya })).data.user;
  await exhaust(`booking:${member.id}`, 40);
  const before = db.sqlite.prepare("SELECT count(*) n FROM bookings").get().n;
  assert.equal(
    (await call("/sessions/2/book", { token: aanya, method: "POST", body: {} }))
      .status,
    429,
  );
  assert.equal(
    db.sqlite.prepare("SELECT count(*) n FROM bookings").get().n,
    before,
  );
  const staff = (await call("/auth/me", { token: admin })).data.user;
  await exhaust(`check-in:${staff.id}`, 30);
  assert.equal(
    (
      await call("/check-in", {
        token: admin,
        method: "POST",
        body: { code: "ABCDEFG2" },
      })
    ).status,
    429,
  );
  assert.equal(
    (await call("/auth/me", { token: aanya })).status,
    200,
    "Read access remains available.",
  );
});

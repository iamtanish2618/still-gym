import { test, after } from "node:test";
import assert from "node:assert/strict";
import { apiFixture } from "../helpers/api-fixture.mjs";
import { hashToken } from "../../server/auth.mjs";

const { db, call, login, aanya, kabir } = await apiFixture();
after(() => db.sqlite.close());
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

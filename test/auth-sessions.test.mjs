import { test } from "node:test";
import assert from "node:assert/strict";
import { database, migrate } from "./database.mjs";
import { handleApi } from "../server/api.mjs";
import { adminStatement } from "../scripts/create-admin.mjs";

test("browser registration uses an HttpOnly cookie, restores identity, blocks CSRF and revokes logout", async () => {
  const db = database();
  migrate(db);
  const call = (
    path,
    { method = "GET", body, cookie, origin, client = true } = {},
  ) =>
    handleApi(
      new Request("https://gym.example/api" + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(client ? { "X-Still-Client": "browser" } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
          ...(origin ? { Origin: origin } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      db,
    );
  try {
    const signup = await call("/auth/register", {
      method: "POST",
      origin: "https://gym.example",
      body: {
        name: "Real User",
        username: "real_user",
        email: "real@example.org",
        password: "RealPassword2026!",
      },
    });
    assert.equal(signup.status, 201);
    const header = signup.headers.get("Set-Cookie");
    for (const flag of [
      "HttpOnly",
      "SameSite=Strict",
      "Secure",
      "Path=/",
      "Max-Age=604800",
    ])
      assert.ok(header.includes(flag), flag);
    assert.equal(
      (await signup.json()).token,
      undefined,
      "Browser session token is not exposed in response JSON",
    );
    const cookie = header.split(";")[0];
    const me = await call("/auth/me", { cookie });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).user.email, "real@example.org");
    assert.equal((await call("/auth/me")).status, 401);
    assert.equal(
      (
        await call("/auth/logout", {
          method: "POST",
          cookie,
          origin: "https://evil.example",
          body: {},
        })
      ).status,
      403,
    );
    assert.equal(
      (await call("/auth/logout", { method: "POST", cookie, body: {} })).status,
      403,
    );
    assert.equal(
      (
        await call("/auth/logout", {
          method: "POST",
          cookie,
          origin: "https://gym.example",
          client: false,
          body: {},
        })
      ).status,
      403,
    );
    const logout = await call("/auth/logout", {
      method: "POST",
      cookie,
      origin: "https://gym.example",
      body: {},
    });
    assert.equal(logout.status, 200);
    assert.ok(logout.headers.get("Set-Cookie").includes("Max-Age=0"));
    assert.equal((await call("/auth/me", { cookie })).status, 401);
  } finally {
    db.sqlite.close();
  }
});
test("cross-site login is rejected and plain HTTP local cookies avoid a Secure-only development failure", async () => {
  const db = database();
  migrate(db);
  try {
    const body = JSON.stringify({
      name: "Local User",
      username: "local_user",
      email: "local@example.org",
      password: "LocalPassword2026!",
    });
    const request = (origin) =>
      new Request("http://127.0.0.1:5173/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Still-Client": "browser",
          Origin: origin,
        },
        body,
      });
    assert.equal(
      (await handleApi(request("https://evil.example"), db)).status,
      403,
    );
    const r = await handleApi(request("http://127.0.0.1:5173"), db);
    assert.equal(r.status, 201);
    assert.ok(!r.headers.get("Set-Cookie").includes("; Secure"));
  } finally {
    db.sqlite.close();
  }
});
test("admin provisioning hashes chosen credentials directly in the DB without elevating an existing member", async () => {
  const db = database();
  migrate(db);
  try {
    const credentials = {
      name: "Owner",
      email: " OWNER@example.org ",
      password: "OwnerPassword2026!",
    };
    const sql = await adminStatement(credentials);
    assert.ok(!sql.includes(credentials.password));
    db.sqlite.exec(sql);
    const admin = db.sqlite
      .prepare("SELECT * FROM users WHERE email='owner@example.org'")
      .get();
    assert.equal(admin.role, "admin");
    assert.notEqual(admin.password_hash, credentials.password);
    const login = await handleApi(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "owner@example.org",
          password: credentials.password,
        }),
      }),
      db,
    );
    assert.equal(login.status, 200);
    assert.ok((await login.json()).token);
    db.sqlite
      .prepare(
        "INSERT INTO users(name,email,password_hash,role) VALUES('Member','member@example.org','unused','member')",
      )
      .run();
    await assert.rejects(adminStatement({ ...credentials, password: "short" }));
    assert.throws(() => db.sqlite.exec(sql));
    assert.equal(
      db.sqlite
        .prepare("SELECT role FROM users WHERE email='member@example.org'")
        .get().role,
      "member",
    );
  } finally {
    db.sqlite.close();
  }
});

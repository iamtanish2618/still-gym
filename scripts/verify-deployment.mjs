// Explicit trusted-operator smoke test. Never runs during build or app startup.
// Creates generated test records, checks the deployed API/browser, then removes
// only that run's records. Requires matching server-only database credentials.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { getDatabase } from "../server/database.mjs";
import { adminStatement } from "./create-admin.mjs";
const base = process.argv[2];
if (
  !/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(base || "") ||
  !process.argv.includes("--test-records")
)
  throw Error(
    "Supply the exact Vercel deployment URL and --test-records. This writes generated audit records and cleans up only those records.",
  );
if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN)
  throw Error("The matching remote database configuration is required.");
const db = await getDatabase(),
  run = randomBytes(6).toString("hex"),
  password = randomBytes(24).toString("base64url");
const title = `Deployment audit ${run}`;
const emails = Array.from(
  { length: 35 },
  (_, i) => `audit-${run}-${i}@still.invalid`,
);
const api = async (path, token, method = "GET", body) => {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: r.status, data: await r.json() };
};
let browser;
try {
  assert.equal((await api("/health")).status, 200);
  await db
    .prepare(
      await adminStatement({
        name: "Deployment audit owner",
        email: emails[34],
        password,
      }),
    )
    .run();
  const admin = (
    await api("/auth/login", null, "POST", { email: emails[34], password })
  ).data.token;
  assert.ok(admin);
  const users = await Promise.all(
    emails.slice(0, 33).map(async (email, i) => {
      const r = await api("/auth/register", null, "POST", {
        name: `Audit member ${i}`,
        username: `audit_${run}_${i}`,
        email,
        password,
      });
      assert.equal(r.status, 201, JSON.stringify(r));
      return r.data;
    }),
  );
  const date = new Date(Date.now() + 3 * 86400000 + 19800000)
    .toISOString()
    .slice(0, 10);
  const makeSession = async () => {
    for (let hour = 0; hour < 24; hour++) {
      const r = await api("/sessions", admin, "POST", { date, hour, title });
      if (r.status === 409) continue;
      assert.equal(r.status, 201, JSON.stringify(r));
      return r.data.session;
    }
    throw Error("No free hour for the audit.");
  };
  const session = await makeSession();
  const begun = performance.now();
  const results = await Promise.all(
    users
      .slice(0, 32)
      .map((u) => api(`/sessions/${session.id}/book`, u.token, "POST", {})),
  );
  assert.equal(
    results.filter((r) => r.status === 201).length,
    20,
    JSON.stringify(
      results.map((r) => ({ status: r.status, error: r.data.error })),
    ),
  );
  assert.equal(results.filter((r) => r.status === 409).length, 12);
  console.log(
    `PASS: deployed API, 32 simultaneous booking requests, exactly 20 confirmations / 12 conflicts (${Math.round(performance.now() - begun)} ms batch wall time).`,
  );
  const losers = results
      .map((r, i) => (r.status === 409 ? i : -1))
      .filter((i) => i >= 0),
    queued = [];
  for (const i of losers.slice(0, 3)) {
    const r = await api(
      `/sessions/${session.id}/waitlist`,
      users[i].token,
      "POST",
      {},
    );
    assert.equal(r.status, 201);
    assert.equal(r.data.booking.code, null);
    queued.push(r.data.booking);
  }
  const winner = results.findIndex((r) => r.status === 201),
    booking = results[winner].data.booking;
  const race = await Promise.all([
    api(`/bookings/${booking.id}`, users[winner].token, "DELETE"),
    api(`/sessions/${session.id}/book`, users[32].token, "POST", {}),
  ]);
  assert.equal(race[0].status, 200);
  assert.equal(race[1].status, 409);
  const promoted = (
    await api("/bookings", users[losers[0]].token)
  ).data.bookings.find((b) => b.id === queued[0].id);
  assert.equal(promoted.status, "confirmed");
  assert.ok(promoted.code);
  assert.equal(
    (await api("/bookings", users[32].token)).data.bookings.length,
    0,
  );
  assert.equal(
    (await api(`/bookings/${promoted.id}`, users[32].token, "DELETE")).status,
    404,
  );
  assert.equal(
    (await api("/sessions", users[32].token, "POST", { date, hour: 23 }))
      .status,
    403,
  );
  console.log(
    "PASS: hosted FIFO promotion, no queue jumping, hidden waitlist codes, ownership and staff authorization.",
  );
  const waiter = users[losers[1]];
  const waitingBefore = (await api("/bookings", waiter.token)).data.bookings;
  assert.equal(
    (await api("/auth/logout", waiter.token, "POST", {})).status,
    200,
  );
  assert.equal((await api("/bookings", waiter.token)).status, 401);
  const returnedWaiter = await api("/auth/login", null, "POST", {
    email: waiter.user.email,
    password,
  });
  assert.equal(returnedWaiter.status, 200);
  waiter.token = returnedWaiter.data.token;
  assert.deepEqual(
    (await api("/bookings", waiter.token)).data.bookings,
    waitingBefore,
  );
  console.log(
    "PASS: live logout/login preserves waitlist booking IDs and positions, and the old token is revoked.",
  );
  const finalSession = await makeSession();
  const fill = await Promise.all(
    users
      .slice(0, 19)
      .map((u) =>
        api(`/sessions/${finalSession.id}/book`, u.token, "POST", {}),
      ),
  );
  assert.ok(fill.every((r) => r.status === 201));
  const finalPair = await Promise.all(
    [19, 20].map((i) =>
      api(`/sessions/${finalSession.id}/book`, users[i].token, "POST", {}),
    ),
  );
  assert.deepEqual(finalPair.map((r) => r.status).sort(), [201, 409]);
  assert.equal(
    (
      await db
        .prepare(
          "SELECT count(*) n FROM bookings WHERE session_id=? AND status='confirmed'",
        )
        .bind(finalSession.id)
        .first()
    ).n,
    20,
  );
  console.log(
    "PASS: live two-person race for the last mat yields one confirmation and one conflict, never 21.",
  );
  const currentHour =
    Math.floor((Date.now() + 19800000) / 3600000) * 3600000 - 19800000;
  if (
    !(await db
      .prepare("SELECT id FROM sessions WHERE start=?")
      .bind(currentHour)
      .first())
  ) {
    await db
      .prepare("UPDATE sessions SET start=? WHERE id=? AND title=?")
      .bind(currentHour, session.id, title)
      .run();
    const checks = await Promise.all([
      api("/check-in", admin, "POST", { code: promoted.code }),
      api("/check-in", admin, "POST", { code: promoted.code }),
    ]);
    assert.deepEqual(checks.map((r) => r.status).sort(), [200, 409]);
    console.log(
      "PASS: deployed concurrent check-in accepts the same code exactly once.",
    );
  }
  const emptySession = await makeSession();
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_CHANNEL
      ? { channel: process.env.CHROME_CHANNEL }
      : {}),
  });
  let context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    }),
    page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await mkdir(".sites-runtime/screenshots", { recursive: true });
  await page.screenshot({
    path: ".sites-runtime/screenshots/live-signup.png",
    fullPage: true,
  });
  await page.getByLabel("Your name").fill("Browser verification");
  const username = `audit_${run}_33`;
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Email address").fill(emails[33]);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password + "wrong");
  await page.getByRole("button", { name: "Create your account" }).click();
  await page.getByText("Your passwords do not match.").waitFor();
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create your account" }).click();
  await page.waitForURL(/#\/sessions$/);
  const cookie = (await context.cookies()).find(
    (c) => c.name === "still_session",
  );
  assert.ok(cookie?.httpOnly && cookie.secure && cookie.sameSite === "Strict");
  await page.locator("#filter-date").fill(date);
  const row = page.locator(
    `.session-row[data-session-id="${emptySession.id}"]`,
  );
  await row.getByRole("button", { name: "Book a mat" }).click();
  await page.getByRole("link", { name: /My bookings/ }).click();
  const code = await page.locator(".booking-code").innerText();
  await page.reload();
  await page.getByText(code, { exact: true }).waitFor();
  const preserved = (
    await (await page.request.get(base + "/api/bookings")).json()
  ).bookings;
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await page.getByLabel("Email or username").waitFor();
  assert.equal((await page.request.get(base + "/api/bookings")).status(), 401);
  await page.getByLabel("Email or username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Enter your space" }).click();
  await page.waitForURL(/#\/sessions$/);
  await page.getByRole("link", { name: /My bookings/ }).click();
  await page.getByText(code, { exact: true }).waitFor();
  assert.deepEqual(
    (await (await page.request.get(base + "/api/bookings")).json()).bookings,
    preserved,
  );
  await context.close();
  context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.getByLabel("Email or username").fill(emails[33]);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Enter your space" }).click();
  await page.waitForURL(/#\/sessions$/);
  await page.getByRole("link", { name: /My bookings/ }).click();
  await page.getByText(code, { exact: true }).waitFor();
  assert.deepEqual(
    (await (await page.request.get(base + "/api/bookings")).json()).bookings,
    preserved,
  );
  console.log(
    "PASS: live confirmed booking ID, code and session survive reload, logout/login and a fresh browser context.",
  );
  await page.getByRole("button", { name: "Cancel booking" }).click();
  await page.getByRole("button", { name: "Yes, release it" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Booking cancelled" })
    .waitFor();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await page.getByLabel("Email or username").fill(username.toUpperCase());
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Enter your space" }).click();
  await page.waitForURL(/#\/sessions$/);
  assert.equal(
    await page.getByRole("switch", { name: "Member mode" }).count(),
    0,
  );
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await page.getByLabel("Email or username").fill(emails[34]);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Enter your space" }).click();
  await page.waitForURL(/#\/admin$/);
  const toggle = page.getByRole("switch", { name: "Member mode" });
  await toggle.click();
  await page.locator('.mode-switch[aria-checked="true"]').waitFor();
  await page.locator("#filter-date").fill(date);
  const adminRow = page.locator(
    `.session-row[data-session-id="${emptySession.id}"]`,
  );
  await adminRow.getByRole("button", { name: "Book a mat" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Your mat is reserved" })
    .waitFor();
  await page.getByRole("link", { name: /My bookings/ }).click();
  const staffCode = await page.locator(".booking-code").innerText();
  await page.reload();
  await page.getByText(staffCode, { exact: true }).waitFor();
  assert.equal(
    (await (await page.request.get(base + "/api/auth/me")).json()).user.role,
    "admin",
  );
  await page.screenshot({
    path: ".sites-runtime/screenshots/live-admin-member-switch.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Cancel booking" }).click();
  await page.getByRole("button", { name: "Yes, release it" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Booking cancelled" })
    .waitFor();
  await toggle.click();
  await page
    .getByRole("heading", { name: "Create a session", exact: true })
    .waitFor();
  console.log(
    "PASS: live admin-only mode switch, same-account booking/reload/cancellation, unchanged admin role, return to staff view; no switch for members.",
  );
  const savedSessions = (
    await (await page.request.get(base + "/api/sessions?date=" + date)).json()
  ).sessions;
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await page.getByLabel("Email or username").fill(emails[34]);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Enter your space" }).click();
  await page.waitForURL(/#\/admin$/);
  assert.deepEqual(
    (await (await page.request.get(base + "/api/sessions?date=" + date)).json())
      .sessions,
    savedSessions,
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator(".workspace")
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  console.log(
    "PASS: live staff-created sessions survive staff logout/login; reduced-motion preference disables animation.",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: live browser signup, password confirmation, secure HttpOnly cookie, real booking/reload/cancellation, logout and username login; no browser exceptions.",
  );
  await browser.close();
  browser = null;
} finally {
  if (browser) await browser.close();
  const placeholders = emails.map(() => "?").join(",");
  const auditUsers = `SELECT id FROM users WHERE email IN (${placeholders})`;
  const sessions = (
    await db.prepare("SELECT id FROM sessions WHERE title=?").bind(title).all()
  ).results;
  const foreign = await db
    .prepare(
      `SELECT count(*) n FROM bookings WHERE session_id IN (SELECT id FROM sessions WHERE title=?) AND user_id NOT IN (${auditUsers})`,
    )
    .bind(title, ...emails)
    .first();
  if (foreign.n)
    throw Error(
      "An external member used an audit session. Audit records preserved for manual review.",
    );
  await db.batch([
    db
      .prepare(`DELETE FROM bookings WHERE user_id IN (${auditUsers})`)
      .bind(...emails),
    db
      .prepare(`DELETE FROM tokens WHERE user_id IN (${auditUsers})`)
      .bind(...emails),
    db
      .prepare(`DELETE FROM users WHERE email IN (${placeholders})`)
      .bind(...emails),
    ...sessions.map((s) =>
      db
        .prepare("DELETE FROM sessions WHERE id=? AND title=?")
        .bind(s.id, title),
    ),
  ]);
  db.client.close();
  console.log(
    "Generated audit accounts, tokens, sessions and bookings removed. Other records were untouched.",
  );
}

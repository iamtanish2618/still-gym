// Run against an empty, migrated, isolated local SQLite database. No demo seed is used.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
const base = process.env.TEST_URL || "http://127.0.0.1:5175";
const dbDir = process.env.TEST_DB_DIR;
if (
  !/^http:\/\/(127\.0\.0\.1|localhost):/.test(base) ||
  !dbDir?.startsWith(".sites-runtime/")
)
  throw Error(
    "Supply TEST_DB_DIR=.sites-runtime/<isolated migrated file.db> and a local TEST_URL.",
  );
const run = Date.now(),
  password = randomBytes(24).toString("base64url"),
  email = `owner-${run}@test.local`;
const provision = spawnSync(process.execPath, ["scripts/create-admin.mjs"], {
  input: JSON.stringify({ name: "Owner Verification", email, password }),
  encoding: "utf8",
  env: {
    ...process.env,
    LOCAL_DATABASE_PATH: dbDir,
    TURSO_DATABASE_URL: "",
    TURSO_AUTH_TOKEN: "",
  },
});
assert.equal(provision.status, 0, provision.stderr);
assert.ok(!provision.stdout.includes(password));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_CHANNEL
    ? { channel: process.env.CHROME_CHANNEL }
    : {}),
});
const errors = [];
const ownerContext = await browser.newContext(),
  memberContext = await browser.newContext(),
  otherContext = await browser.newContext();
const owner = await ownerContext.newPage(),
  member = await memberContext.newPage();
for (const p of [owner, member])
  p.on("pageerror", (e) => errors.push(e.message));
try {
  await owner.goto(base);
  await owner.getByLabel("Email or username").fill(email);
  await owner.getByLabel("Password", { exact: true }).fill(password);
  await owner.getByRole("button", { name: "Enter your space" }).click();
  await owner.waitForURL(/#\/admin$/);
  assert.equal((await owner.request.get(base + "/api/sessions")).status(), 200);
  assert.equal(
    (await (await owner.request.get(base + "/api/sessions")).json()).sessions
      .length,
    0,
    "Fresh DB must contain no predefined sessions.",
  );
  await member.goto(base);
  await member
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await member.getByLabel("Your name").fill("Registered Member");
  await member
    .getByLabel("Username", { exact: true })
    .fill(`registered_${run}`);
  await member.getByLabel("Confirm password").fill(password);
  await member.getByLabel("Email address").fill(`registered-${run}@test.local`);
  await member.getByLabel("Password", { exact: true }).fill(password);
  await member.getByRole("button", { name: "Create your account" }).click();
  await member.waitForURL(/#\/sessions$/);
  await member
    .getByRole("heading", { name: "A little breathing room." })
    .waitFor();
  const cookies = await memberContext.cookies();
  assert.ok(
    cookies.find(
      (c) =>
        c.name === "still_session" && c.httpOnly && c.sameSite === "Strict",
    ),
  );
  assert.equal(
    await member.evaluate(() => sessionStorage.getItem("still-token")),
    null,
  );
  assert.equal(
    await member.evaluate(() => localStorage.getItem("still-token")),
    null,
  );
  const forbidden = await member.request.post(base + "/api/sessions", {
    headers: { Origin: base, "X-Still-Client": "browser" },
    data: { date: "2030-01-01", hour: 9 },
  });
  assert.equal(forbidden.status(), 403);
  assert.equal((await forbidden.json()).error.code, "FORBIDDEN");
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(Date.now() + 86400000);
  await owner.getByLabel("Session name").fill("Created through the admin UI");
  await owner.getByLabel("Date (IST)", { exact: true }).fill(date);
  await owner.getByLabel("Start hour (IST)").selectOption("9");
  await owner
    .getByRole("button", { name: "Create session", exact: true })
    .click();
  await owner
    .getByRole("status")
    .filter({ hasText: "Session created" })
    .waitFor();
  await member.locator("#filter-date").fill(date);
  const row = member.locator(".session-row");
  await member.locator("#filter-date").fill(date);
  await row.getByRole("button", { name: "Book a mat" }).waitFor();
  assert.equal(await row.locator(".availability strong").innerText(), "20");
  await row.getByRole("button", { name: "Book a mat" }).click();
  await member
    .getByRole("status")
    .filter({ hasText: "Your mat is reserved" })
    .waitFor();
  await member.getByRole("link", { name: /My bookings/ }).click();
  await member.locator(".booking-code").waitFor();
  const firstCode = await member.locator(".booking-code").innerText();
  await member.reload();
  await member.getByText(firstCode, { exact: true }).waitFor();
  const second = await otherContext.request.post(base + "/api/auth/register", {
    headers: { Origin: base, "X-Still-Client": "browser" },
    data: {
      username: `other_${run}`,
      name: "Other Member",
      email: `other-${run}@test.local`,
      password,
    },
  });
  assert.equal(second.status(), 201);
  assert.equal(
    (await (await otherContext.request.get(base + "/api/bookings")).json())
      .bookings.length,
    0,
  );
  await member.getByRole("button", { name: "Cancel booking" }).click();
  await member.getByRole("button", { name: "Yes, release it" }).click();
  await member
    .getByRole("status")
    .filter({ hasText: "Booking cancelled" })
    .waitFor();
  await member.getByRole("link", { name: "Sessions", exact: true }).click();
  await member.locator("#filter-date").fill(date);
  await row.getByRole("button", { name: "Book a mat" }).waitFor();
  assert.equal(await row.locator(".availability strong").innerText(), "20");
  await row.getByRole("button", { name: "Book a mat" }).click();
  await member
    .getByRole("status")
    .filter({ hasText: "Your mat is reserved" })
    .waitFor();
  await member.getByRole("link", { name: /My bookings/ }).click();
  await member.locator(".booking-code").waitFor();
  assert.notEqual(await member.locator(".booking-code").innerText(), firstCode);
  const meBefore = await member.request.get(base + "/api/auth/me");
  assert.equal(meBefore.status(), 200);
  await member.getByRole("button", { name: "Log out", exact: true }).click();
  await member.getByLabel("Email or username").waitFor();
  assert.equal((await member.request.get(base + "/api/auth/me")).status(), 401);
  await member.reload();
  await member.getByLabel("Email or username").waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: EMPTY database, chosen admin credentials through CLI, real member registration, HttpOnly login, admin UI session creation, live booking, reload persistence, cancellation/rebooking, member privacy, role enforcement and logout. No demo seed or browser exceptions.",
  );
} finally {
  await browser.close();
}

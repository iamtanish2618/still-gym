import { chromium } from "playwright";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
const base = process.env.TEST_URL || "http://127.0.0.1:5182";
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(base))
  throw Error("Use an isolated local reviewer fixture.");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_CHANNEL
    ? { channel: process.env.CHROME_CHANNEL }
    : {}),
});
const ownerContext = await browser.newContext(),
  owner = await ownerContext.newPage(),
  errors = [];
let memberContext = await browser.newContext(),
  member = await memberContext.newPage();
const watch = (page) => page.on("pageerror", (e) => errors.push(e.message));
watch(owner);
watch(member);
const run = Date.now(),
  username = `persist_${run}`,
  email = `persist-${run}@test.local`,
  password = randomBytes(24).toString("base64url"),
  title = `Persistence ${run}`;
async function login(page, identity, pass) {
  await page.getByLabel("Email or username").fill(identity);
  await page.getByLabel("Password", { exact: true }).fill(pass);
  await page.getByRole("button", { name: "Enter your space" }).click();
}
try {
  await owner.goto(base);
  await login(owner, "admin@still.demo", "StillDemo2026!");
  await owner.waitForURL(/#\/admin$/);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(Date.now() + 12 * 86400000);
  const occupied = (
    await (await owner.request.get(base + "/api/sessions?date=" + date)).json()
  ).sessions.map((s) => new Date(s.start + 19800000).getUTCHours());
  const hour = Array.from({ length: 24 }, (_, i) => i).find(
    (i) => !occupied.includes(i),
  );
  assert.notEqual(hour, undefined);
  await owner.getByLabel("Session name").fill(title);
  await owner.getByLabel("Date (IST)", { exact: true }).fill(date);
  await owner.getByLabel("Start hour (IST)").selectOption(String(hour));
  await owner
    .getByRole("button", { name: "Create session", exact: true })
    .click();
  await owner
    .getByRole("status")
    .filter({ hasText: "Session created" })
    .waitFor();
  const created = (
    await (await owner.request.get(base + "/api/sessions?date=" + date)).json()
  ).sessions.find((s) => s.title === title);
  assert.ok(created);
  await member.goto(base);
  await member
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await member.getByLabel("Your name").fill("Persistent Member");
  await member.getByLabel("Username", { exact: true }).fill(username);
  await member.getByLabel("Email address").fill(email);
  await member.getByLabel("Password", { exact: true }).fill(password);
  await member.getByLabel("Confirm password").fill(password);
  await member.getByRole("button", { name: "Create your account" }).click();
  await member.waitForURL(/#\/sessions$/);
  await member.locator("#filter-date").fill(date);
  const row = member.locator(`.session-row[data-session-id="${created.id}"]`);
  await row.getByRole("button", { name: "Book a mat", exact: true }).click();
  await member
    .getByRole("status")
    .filter({ hasText: "Your mat is reserved" })
    .waitFor();
  await member.getByRole("link", { name: /My bookings/ }).click();
  const code = await member.locator(".booking-code").innerText();
  const before = (
    await (await member.request.get(base + "/api/bookings")).json()
  ).bookings;
  assert.equal(before.length, 1);
  assert.equal(before[0].code, code);
  await member.reload();
  await member.getByText(code, { exact: true }).waitFor();
  await member.getByRole("button", { name: "Log out", exact: true }).click();
  await member.getByLabel("Email or username").waitFor();
  assert.equal(
    (await member.request.get(base + "/api/bookings")).status(),
    401,
  );
  const staffView = (
    await (
      await owner.request.get(base + `/api/sessions/${created.id}/bookings`)
    ).json()
  ).bookings;
  assert.ok(
    staffView.some(
      (b) =>
        b.id === before[0].id && b.code === code && b.status === "confirmed",
    ),
  );
  await login(member, username, password);
  await member.waitForURL(/#\/sessions$/);
  await member.getByRole("link", { name: /My bookings/ }).click();
  await member.getByText(code, { exact: true }).waitFor();
  assert.deepEqual(
    (await (await member.request.get(base + "/api/bookings")).json()).bookings,
    before,
  );
  await memberContext.close();
  memberContext = await browser.newContext();
  member = await memberContext.newPage();
  watch(member);
  await member.goto(base);
  await login(member, email, password);
  await member.waitForURL(/#\/sessions$/);
  await member.getByRole("link", { name: /My bookings/ }).click();
  await member.getByText(code, { exact: true }).waitFor();
  assert.deepEqual(
    (await (await member.request.get(base + "/api/bookings")).json()).bookings,
    before,
  );
  await owner.getByRole("button", { name: "Log out", exact: true }).click();
  await owner.getByLabel("Email or username").waitFor();
  await login(owner, "admin@still.demo", "StillDemo2026!");
  await owner.waitForURL(/#\/admin$/);
  await owner.locator("#admin-date").fill(date);
  await owner
    .locator(`#roster-session option[value="${created.id}"]`)
    .waitFor({ state: "attached" });
  const after = (
    await (await owner.request.get(base + "/api/sessions?date=" + date)).json()
  ).sessions.find((s) => s.id === created.id);
  assert.equal(after.title, title);
  assert.equal(after.remaining, 19);
  await member.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await member
      .locator(".workspace")
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  await mkdir(".sites-runtime/screenshots", { recursive: true });
  await member.screenshot({
    path: ".sites-runtime/screenshots/booking-persistence.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: booking/code/ID survive reload, logout/login and a fresh browser context; logout revokes access without freeing the mat; staff-created sessions survive staff logout/login; reduced motion respected; no browser exceptions.",
  );
} finally {
  await browser.close();
}

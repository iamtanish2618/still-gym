import { chromium } from "playwright";
import assert from "node:assert/strict";
const base = process.env.TEST_URL || "http://127.0.0.1:5181";
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(base))
  throw Error("Use an isolated local reviewer database.");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_CHANNEL
    ? { channel: process.env.CHROME_CHANNEL }
    : {}),
});
const page = await browser.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(base);
  await page.getByLabel("Email or username").fill("admin@still.demo");
  await page.getByLabel("Password", { exact: true }).fill("StillDemo2026!");
  await page.getByRole("button", { name: "Enter your space" }).click();
  await page.waitForURL(/#\/admin$/);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(Date.now() + 8 * 86400000);
  const title = `Reload proof ${Date.now()}`;
  const saved = await (
    await page.request.get(base + "/api/sessions?date=" + date)
  ).json();
  const occupied = new Set(
    saved.sessions.map((s) => new Date(s.start + 19800000).getUTCHours()),
  );
  const hour = Array.from({ length: 24 }, (_, i) => i).find(
    (i) => !occupied.has(i),
  );
  assert.notEqual(hour, undefined);
  await page.getByLabel("Session name").fill(title);
  await page.getByLabel("Date (IST)", { exact: true }).fill(date);
  await page.getByLabel("Start hour (IST)").selectOption(String(hour));
  await page
    .getByRole("button", { name: "Create session", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Session created" })
    .waitFor();
  const select = page.locator("#roster-session");
  const option = select.locator("option").filter({ hasText: title });
  await option.waitFor({ state: "attached" });
  const id = await option.getAttribute("value");
  await select.selectOption(id);
  await page.waitForURL(
    (url) =>
      url.searchParams.get("date") === date &&
      url.searchParams.get("session") === id,
  );
  await page.reload();
  await select
    .locator("option")
    .filter({ hasText: title })
    .waitFor({ state: "attached" });
  assert.equal(await page.locator("#admin-date").inputValue(), date);
  assert.equal(await select.inputValue(), id);
  await page.getByRole("switch", { name: "Member mode" }).click();
  await page.locator(".session-row").filter({ hasText: title }).waitFor();
  await page.reload();
  await page.locator(".session-row").filter({ hasText: title }).waitFor();
  assert.equal(await page.locator("#filter-date").inputValue(), date);
  await page.locator("#filter-date").fill("2030-01-01");
  await page
    .getByRole("heading", { name: "A little breathing room." })
    .waitFor();
  await page.reload();
  await page
    .getByRole("heading", { name: "A little breathing room." })
    .waitFor();
  assert.equal(await page.locator("#filter-date").inputValue(), "2030-01-01");
  await page.getByRole("button", { name: "All upcoming", exact: true }).click();
  await page.getByRole("heading", { name: /Upcoming sessions/ }).waitFor();
  await page.locator(".session-row").filter({ hasText: title }).waitFor();
  await page.reload();
  await page.locator(".session-row").filter({ hasText: title }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("date"), null);
  await page.goto(base + "?date=invalid#/sessions");
  await page.getByRole("heading", { name: /Upcoming sessions/ }).waitFor();
  await page.locator(".session-row").filter({ hasText: title }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: created session, chosen date and selected register survive reload; member view preserves filters; empty-day filter survives; all-upcoming survives; invalid URL filter safely falls back; no browser exceptions.",
  );
} finally {
  await browser.close();
}

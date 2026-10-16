import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const base = process.env.TEST_URL || "http://127.0.0.1:5173";
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(base))
  throw Error("This smoke test mutates demo data; use a local instance.");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_CHANNEL
    ? { channel: process.env.CHROME_CHANNEL }
    : {}),
});
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", (e) => errors.push(e.message));
const screenshotDir =
  process.env.SCREENSHOT_DIR || ".sites-runtime/screenshots";
await mkdir(screenshotDir, { recursive: true });
const shot = (name) =>
  page.screenshot({ path: `${screenshotDir}/${name}.png`, fullPage: true });
async function login(email) {
  await page.goto(base);
  await page.getByLabel("Email or username").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("StillDemo2026!");
  await page.getByRole("button", { name: "Enter your space" }).click();
  await page.waitForURL(/#\/(sessions|admin)$/);
}
async function api(path, token, method = "GET", body) {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
try {
  await page.goto(base);
  await page.getByRole("heading", { name: "Welcome back." }).waitFor();
  await shot("login-desktop");
  await page.getByRole("button", { name: "Enter your space" }).click();
  await page.getByText("Enter your email or username.").waitFor();
  await login("aanya@still.demo");
  await page.locator(".session-row").first().waitFor();
  await page.getByRole("button", { name: "All upcoming", exact: true }).click();
  await page.getByRole("button", { name: "Join waitlist" }).first().waitFor();
  await shot("sessions-desktop");
  // Full-session waitlist and live promotion after a second member cancels.
  const full = page
    .locator(".session-row")
    .filter({ has: page.getByRole("button", { name: "Join waitlist" }) })
    .first();
  await full.getByRole("button", { name: "Join waitlist" }).click();
  await page.getByRole("status").filter({ hasText: "number 1" }).waitFor();
  await page.getByRole("link", { name: /My bookings/ }).click();
  await page
    .locator(".booking-card")
    .filter({ hasText: "Waitlisted" })
    .waitFor();
  const token = (
    await api("/auth/login", null, "POST", {
      email: "aanya@still.demo",
      password: "StillDemo2026!",
    })
  ).data.token;
  const own = (await api("/bookings", token)).data.bookings;
  const waiting = own.find((b) => b.status === "waitlisted");
  assert.ok(waiting);
  const other = (
    await api("/auth/login", null, "POST", {
      email: "member1@still.demo",
      password: "StillDemo2026!",
    })
  ).data.token;
  const victim = (await api("/bookings", other)).data.bookings.find(
    (b) => b.session_id === waiting.session_id && b.status === "confirmed",
  );
  assert.ok(victim);
  assert.equal(
    (await api("/bookings/" + victim.id, other, "DELETE")).status,
    200,
  );
  await page
    .getByRole("status")
    .filter({ hasText: "A mat opened up" })
    .waitFor({ timeout: 10000 });
  const promoted = (await api("/bookings", token)).data.bookings.find(
    (b) => b.id === waiting.id,
  );
  assert.equal(promoted.status, "confirmed");
  assert.ok(promoted.code);
  await shot("bookings-desktop");
  const active = own.find(
    (b) =>
      b.start <= Date.now() &&
      b.start + 3600000 > Date.now() &&
      b.status === "confirmed",
  );
  assert.ok(active, "Seed must be fresh for active check-in test");
  // Cancellation through UI returns the promoted mat; restore the seeded full session.
  const promotedCard = page
    .locator(".booking-card")
    .filter({ hasText: promoted.code });
  await promotedCard.getByRole("button", { name: "Cancel booking" }).click();
  await promotedCard.getByRole("button", { name: "Yes, release it" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Booking cancelled" })
    .waitFor();
  assert.equal(
    (await api(`/sessions/${waiting.session_id}/book`, other, "POST", {}))
      .status,
    201,
  );
  // Member cannot enter staff screen via a direct URL.
  await page.goto(base + "/#/admin");
  await page.waitForURL(/#\/sessions$/);
  for (const width of [360, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator(".session-row").first().waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `overflow at ${width}`,
    );
    await shot("sessions-" + width);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await page.getByLabel("Email or username").waitFor();
  await login("admin@still.demo");
  await page
    .getByRole("heading", { name: "Create a session", exact: true })
    .waitFor();
  await shot("admin-desktop");
  await page.getByLabel("Booking code").fill(active.code);
  await page.getByRole("button", { name: "Check in member" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Aanya Shah is checked in" })
    .waitFor();
  await page.getByLabel("Booking code").fill(active.code);
  await page.getByRole("button", { name: "Check in member" }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Code unavailable" })
    .waitFor();
  for (const width of [360, 768]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `admin overflow at ${width}`,
    );
    await shot("admin-" + width);
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: login, validation, waitlist, live promotion, cancellation, rebook, protected routes, check-in/replay, 360/768/1280 layouts; no browser exceptions.",
  );
} finally {
  await browser.close();
}

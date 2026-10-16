import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const base = process.env.TEST_URL || "http://127.0.0.1:5174";
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(base))
  throw Error("Isolated local reviewer fixture only.");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_CHANNEL
    ? { channel: process.env.CHROME_CHANNEL }
    : {}),
});
const context = await browser.newContext(),
  page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(base);
  await page.getByLabel("Email or username").fill("admin@still.demo");
  await page.getByLabel("Password", { exact: true }).fill("StillDemo2026!");
  await page.getByRole("button", { name: "Enter your space" }).click();
  await page.waitForURL(/#\/admin$/);
  const toggle = page.getByRole("switch", { name: "Member mode" });
  assert.equal(await toggle.getAttribute("aria-checked"), "false");
  await toggle.focus();
  await page.keyboard.press("Space");
  await page.waitForURL(/#\/sessions$/);
  await page.locator('.mode-switch[aria-checked="true"]').waitFor();
  assert.equal(await toggle.getAttribute("aria-checked"), "true");
  await page.getByRole("button", { name: "All upcoming", exact: true }).click();
  const row = page
    .locator(".session-row")
    .filter({
      has: page.getByRole("button", { name: "Book a mat", exact: true }),
    })
    .first();
  await row.getByRole("button", { name: "Book a mat", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Your mat is reserved" })
    .waitFor();
  await page.getByRole("link", { name: /My bookings/ }).click();
  const code = await page.locator(".booking-code").first().innerText();
  await page.reload();
  await page.getByText(code, { exact: true }).waitFor();
  await page.locator('.mode-switch[aria-checked="true"]').waitFor();
  assert.equal(await toggle.getAttribute("aria-checked"), "true");
  await page.getByRole("button", { name: "Cancel booking" }).first().click();
  await page.getByRole("button", { name: "Yes, release it" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Booking cancelled" })
    .waitFor();
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  await toggle.click();
  await page.waitForURL(/#\/admin$/);
  await page
    .getByRole("heading", { name: "Create a session", exact: true })
    .waitFor();
  await mkdir(".sites-runtime/screenshots", { recursive: true });
  await page.screenshot({
    path: ".sites-runtime/screenshots/admin-member-switch.png",
    fullPage: true,
  });
  assert.equal(
    (await (await page.request.get(base + "/api/auth/me")).json()).user.role,
    "admin",
  );
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await page.getByLabel("Email or username").fill("aanya@still.demo");
  await page.getByLabel("Password", { exact: true }).fill("StillDemo2026!");
  await page.getByRole("button", { name: "Enter your space" }).click();
  await page.waitForURL(/#\/sessions$/);
  assert.equal(
    await page.getByRole("switch", { name: "Member mode" }).count(),
    0,
  );
  await page.goto(base + "/#/admin");
  await page.waitForURL(/#\/sessions$/);
  for (const [path, method, data] of [
    ["/sessions", "POST", { role: "admin" }],
    ["/sessions/1/bookings", "GET"],
    ["/check-in", "POST", { code: "ABCDEFGH", role: "admin" }],
  ]) {
    const response = await page.request.fetch(base + "/api" + path, {
      method,
      headers: { Origin: base, "X-Still-Client": "browser" },
      ...(data ? { data } : {}),
    });
    assert.equal(response.status(), 403);
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: admin-only keyboard-accessible switch; same-account booking/cancellation/reload, return to staff view, 360/768/1280 widths; members see no switch and cannot access staff pages/APIs.",
  );
} finally {
  await browser.close();
}

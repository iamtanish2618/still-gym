import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
const screenshots = process.env.SCREENSHOT_DIR || ".sites-runtime/screenshots";
mkdirSync(screenshots, { recursive: true });
const base = process.env.TEST_URL || "http://127.0.0.1:5173";
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(base))
  throw Error("Local demo only.");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_CHANNEL
    ? { channel: process.env.CHROME_CHANNEL }
    : {}),
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
try {
  await page.goto(base);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByLabel("Your name").fill("Browser Test");
  await page
    .getByLabel("Username", { exact: true })
    .fill(`browser_${Date.now()}`);
  await page.getByLabel("Confirm password").fill("BrowserTest2026!");
  await page
    .getByLabel("Email address")
    .fill(`browser-${Date.now()}@still.demo`);
  await page.getByLabel("Password", { exact: true }).fill("BrowserTest2026!");
  await page.getByRole("button", { name: "Create your account" }).click();
  await page.waitForURL(/#\/sessions$/);
  const tomorrow = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(Date.now() + 86400000);
  await page.locator("#filter-date").fill(tomorrow);
  await page.getByRole("button", { name: "Book a mat" }).first().waitFor();
  const title = await page
    .locator(".session-row")
    .filter({ has: page.getByRole("button", { name: "Book a mat" }) })
    .first()
    .locator("h3")
    .innerText();
  const row = page.locator(".session-row").filter({ hasText: title });
  const before = Number(await row.locator(".availability strong").innerText());
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/api/sessions/*/book", async (route) => {
    await gate;
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "CONFLICT",
          message: "The final mat was just taken.",
          fields: {},
        },
      }),
    });
  });
  await row.getByRole("button", { name: "Book a mat" }).click();
  assert.equal(
    Number(await row.locator(".availability strong").innerText()),
    before - 1,
  );
  release();
  await page
    .locator(".alert[role=alert]")
    .filter({ hasText: "The final mat was just taken." })
    .waitFor();
  await row.getByRole("button", { name: "Book a mat" }).waitFor();
  assert.equal(
    Number(await row.locator(".availability strong").innerText()),
    before,
  );
  await page.unroute("**/api/sessions/*/book");
  await row.getByRole("button", { name: "Book a mat" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Your mat is reserved" })
    .waitFor();
  await page.getByRole("link", { name: /My bookings/ }).click();
  await page.locator(".booking-code").waitFor();
  await page.getByRole("button", { name: "Cancel booking" }).click();
  await page.getByRole("button", { name: "Yes, release it" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Booking cancelled" })
    .waitFor();
  await page.getByRole("link", { name: "Sessions", exact: true }).click();
  await page.locator("#filter-date").fill("2030-01-01");
  await page
    .getByRole("heading", { name: "A little breathing room." })
    .waitFor();
  await page.locator("#filter-date").fill(tomorrow);
  await page.locator(".session-row").first().waitFor();
  await page.screenshot({
    animations: "disabled",
    path: `${screenshots}/schedule-preview.png`,
    fullPage: true,
  });
  await page.context().setOffline(true);
  await page
    .locator(".alert[role=alert]")
    .filter({ hasText: "Cannot connect" })
    .waitFor({ timeout: 10000 });
  await page.context().setOffline(false);
  const retry = page.getByRole("button", { name: "Try again" });
  if (await retry.isVisible()) {
    await retry.click({ timeout: 2000 }).catch(async (error) => {
      // A successful reconnect poll may remove the retry control mid-click.
      if (await retry.isVisible()) throw error;
    });
  }
  await page.locator(".alert[role=alert]").waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({
    animations: "disabled",
    path: `${screenshots}/mobile-preview.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await page.getByLabel("Email or username").waitFor();
  await page.screenshot({
    animations: "disabled",
    path: `${screenshots}/login-mobile.png`,
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  // Keyboard skip link focuses main without changing the application's route.
  await page.keyboard.press("Control+Home");
  await page.getByRole("link", { name: "Skip to content" }).focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.evaluate(() => document.activeElement.id), "main");
  console.log(
    "PASS: registration, optimistic decrement/409 rollback, UI booking/cancel, empty state, network error/recovery, mobile login, keyboard skip.",
  );
} finally {
  await browser.close();
}

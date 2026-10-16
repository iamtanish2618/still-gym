import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";

const base = process.env.TEST_URL;
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(base || ""))
  throw Error("Use an isolated local server.");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_CHANNEL
    ? { channel: process.env.CHROME_CHANNEL }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 360, height: 800 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
async function scan(screen) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  assert.deepEqual(
    results.violations.map((v) => ({
      rule: v.id,
      impact: v.impact,
      elements: v.nodes.map((n) => n.target),
    })),
    [],
    `${screen}: accessibility violations`,
  );
}
async function login(email) {
  await page.getByLabel("Email or username").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("StillDemo2026!");
  await page.getByRole("button", { name: "Enter your space" }).click();
}
try {
  await page.goto(base);
  await page.getByLabel("Email or username").waitFor();
  await scan("login");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await scan("signup");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await login("aanya@still.demo");
  await page.waitForURL(/#\/sessions$/);
  await page.locator(".session-row").first().waitFor();
  await scan("sessions at 360px");
  await page.getByRole("link", { name: /My bookings/ }).click();
  await page.locator(".booking-card").first().waitFor();
  await scan("bookings at 360px");
  await page.getByRole("button", { name: "Log out" }).click();
  await login("admin@still.demo");
  await page.waitForURL(/#\/admin$/);
  await page
    .getByRole("heading", { name: "Create a session", exact: true })
    .waitFor();
  await scan("admin at 360px");
  console.log(
    "PASS: automated WCAG A/AA checks on login, signup, sessions, bookings and admin at 360px. Manual keyboard/layout checks run separately.",
  );
} finally {
  await browser.close();
}

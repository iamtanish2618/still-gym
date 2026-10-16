import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
export async function verifyBrowser({
  base,
  run,
  password,
  emails,
  date,
  emptySession,
}) {
  let browser;
  try {
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
      animations: "disabled",
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
    assert.ok(
      cookie?.httpOnly && cookie.secure && cookie.sameSite === "Strict",
    );
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
    assert.equal(
      (await page.request.get(base + "/api/bookings")).status(),
      401,
    );
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
      animations: "disabled",
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
      (
        await (
          await page.request.get(base + "/api/sessions?date=" + date)
        ).json()
      ).sessions,
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
  } finally {
    await browser?.close();
  }
}

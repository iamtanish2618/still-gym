import { chromium } from "playwright";
import assert from "node:assert/strict";
const base = process.env.TEST_URL || "http://127.0.0.1:5174";
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(base))
  throw Error("Local isolated demo only.");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_CHANNEL
    ? { channel: process.env.CHROME_CHANNEL }
    : {}),
});
const errors = [];
async function api(path, token, method = "GET", body) {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
const member = (
  await api("/auth/register", null, "POST", {
    name: "Flow Audit",
    username: `flow_${Date.now()}`,
    email: `flow-${Date.now()}@test.local`,
    password: "FlowAudit2026!",
  })
).data;
assert.ok(member.token);
async function open(token, route = "sessions") {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await context.addCookies([
    {
      name: "still_session",
      value: token,
      url: base,
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
  return { context, page, goto: () => page.goto(base + "/#/" + route) };
}
try {
  // Slow responses must render before a second quiet poll can supersede them.
  {
    const { page, context, goto } = await open(member.token);
    let requests = 0;
    await page.route("**/api/sessions?date=*", async (route) => {
      requests++;
      await new Promise((r) => setTimeout(r, 4500));
      await route.continue();
    });
    await goto();
    await page.locator(".session-row").first().waitFor({ timeout: 8500 });
    assert.ok(requests <= 2);
    await context.close();
    console.log(
      "PASS: 4.5-second session responses render instead of being starved by 3-second polling.",
    );
  }
  // The server may commit successfully while the browser loses the HTTP response.
  {
    const { page, context, goto } = await open(member.token);
    await goto();
    if (
      await page
        .getByRole("button", { name: "All upcoming", exact: true })
        .isVisible()
    )
      await page
        .getByRole("button", { name: "All upcoming", exact: true })
        .click();
    const target = (await api("/sessions", member.token)).data.sessions.find(
      (s) => s.start > Date.now() && s.remaining > 0,
    );
    assert.ok(target);
    const row = page.locator(`[data-session-id="${target.id}"]`);
    await row.getByRole("button", { name: "Book a mat" }).waitFor();
    await page.route(`**/api/sessions/${target.id}/book`, async (route) => {
      const r = await route.fetch();
      assert.equal(r.status(), 201);
      await route.abort("failed");
    });
    await row.getByRole("button", { name: "Book a mat" }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "Your mat is reserved" })
      .waitFor();
    await page.locator(".alert[role=alert]").waitFor({ state: "hidden" });
    await page.getByRole("link", { name: /My bookings/ }).click();
    const booking = (await api("/bookings", member.token)).data.bookings.find(
      (b) => b.session_id === target.id && b.status === "confirmed",
    );
    assert.ok(booking);
    const card = page.locator(`[data-booking-id="${booking.id}"]`);
    await card.getByText(booking.code, { exact: true }).waitFor();
    await page.reload();
    await card.getByText(booking.code, { exact: true }).waitFor();
    assert.equal(
      (await api(`/sessions/${target.id}/book`, member.token, "POST", {}))
        .status,
      409,
    );
    await page.route(`**/api/bookings/${booking.id}`, async (route) => {
      const r = await route.fetch();
      assert.equal(r.status(), 200);
      await route.abort("failed");
    });
    await card.getByRole("button", { name: "Cancel booking" }).click();
    await card.getByRole("button", { name: "Yes, release it" }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "Cancellation verified with the studio" })
      .waitFor();
    await card.getByText("Cancelled", { exact: true }).waitFor();
    assert.equal(await card.locator(".booking-code").count(), 0);
    await context.close();
    console.log(
      "PASS: lost booking/cancellation responses reconcile with real SQL state, no duplicate reservation, code survives reload and disappears after cancellation.",
    );
  }
  // A queue entry can be promoted while the join response is travelling back.
  {
    const { page, context, goto } = await open(member.token);
    await goto();
    if (
      await page
        .getByRole("button", { name: "All upcoming", exact: true })
        .isVisible()
    )
      await page
        .getByRole("button", { name: "All upcoming", exact: true })
        .click();
    const full = (await api("/sessions", member.token)).data.sessions.find(
      (s) => s.start > Date.now() && s.remaining === 0 && s.waiting === 0,
    );
    assert.ok(full);
    const other = (
      await api("/auth/login", null, "POST", {
        email: "member1@still.demo",
        password: "StillDemo2026!",
      })
    ).data.token;
    const victim = (await api("/bookings", other)).data.bookings.find(
      (b) => b.session_id === full.id && b.status === "confirmed",
    );
    assert.ok(victim);
    let promoted;
    await page.route(`**/api/sessions/${full.id}/waitlist`, async (route) => {
      const r = await route.fetch();
      assert.equal(r.status(), 201);
      assert.equal(
        (await api("/bookings/" + victim.id, other, "DELETE")).status,
        200,
      );
      promoted = (await api("/bookings", member.token)).data.bookings.find(
        (b) => b.session_id === full.id && b.status === "confirmed",
      );
      assert.ok(promoted);
      await route.fulfill({ response: r, json: { booking: promoted } });
    });
    await page
      .locator(`[data-session-id="${full.id}"]`)
      .getByRole("button", { name: "Join waitlist" })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Your mat is reserved" })
      .waitFor();
    assert.ok(
      !(await page.getByRole("status").innerText()).includes("number null"),
    );
    await page.getByRole("link", { name: /My bookings/ }).click();
    await page.getByText(promoted.code, { exact: true }).waitFor();
    assert.equal(
      (await api("/bookings/" + promoted.id, member.token, "DELETE")).status,
      200,
    );
    assert.equal(
      (await api(`/sessions/${full.id}/book`, other, "POST", {})).status,
      201,
    );
    await context.close();
    console.log(
      "PASS: promotion during join shows the actual confirmation and code, never a null queue position.",
    );
  }
  // UI-only time and large-queue display; server rules are tested separately.
  {
    const { page, context, goto } = await open(member.token, "bookings");
    const start = Date.now() + 4000;
    await page.route("**/api/bookings", (route) =>
      route.fulfill({
        json: {
          serverTime: Date.now(),
          bookings: [
            {
              id: 999999,
              session_id: 999999,
              title: "Waitlist boundary",
              start,
              status: "waitlisted",
              code: null,
              position: 100,
              checked_in_at: null,
            },
          ],
        },
      }),
    );
    await goto();
    await page.locator(".queue-number").filter({ hasText: "100" }).waitFor();
    await page
      .getByText("This waitlist is closed.", { exact: false })
      .waitFor({ timeout: 9000 });
    assert.equal((await page.locator(".queue-number").innerText()).trim(), "—");
    assert.equal(
      await page
        .getByRole("button", { name: "Leave waitlist", exact: true })
        .count(),
      0,
    );
    await context.close();
    console.log(
      "PASS: position 100 is displayed accurately and the waitlist closes at session start.",
    );
  }
  // Staff uses a register, and receives roster updates over the same slow connection.
  {
    const admin = (
      await api("/auth/login", null, "POST", {
        email: "admin@still.demo",
        password: "StillDemo2026!",
      })
    ).data;
    const { page, context, goto } = await open(admin.token, "admin");
    await goto();
    const date = new Date(Date.now() + 25 * 86400000 + 19800000)
        .toISOString()
        .slice(0, 10),
      title = "Browser audit " + Date.now();
    await page.getByLabel("Session name").fill(title);
    await page.getByLabel("Date (IST)", { exact: true }).fill(date);
    await page.getByLabel("Start hour (IST)").selectOption("6");
    await page
      .getByRole("button", { name: "Create session", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Session created" })
      .waitFor();
    await page.getByRole("link", { name: "Sessions", exact: true }).click();
    const row = page.locator(".session-row").filter({ hasText: title });
    await row.getByRole("button", { name: "Book a mat" }).waitFor();
    const sessionId = Number(await row.getAttribute("data-session-id"));
    assert.equal(
      (await api(`/sessions/${sessionId}/book`, member.token, "POST", {}))
        .status,
      201,
    );
    await page.route(`**/api/sessions/${sessionId}/bookings`, async (route) => {
      await new Promise((r) => setTimeout(r, 4500));
      await route.continue();
    });
    await page.getByRole("switch", { name: "Member mode" }).click();
    await page.locator(".roster-select select").selectOption(String(sessionId));
    await page
      .locator("tbody")
      .getByText("Flow Audit", { exact: true })
      .waitFor({ timeout: 8500 });
    await context.close();
    console.log(
      "PASS: admin creates a session, opens its register, and sees the booking even with a slow roster request.",
    );
  }
  assert.deepEqual(errors, []);
  console.log("PASS: no browser exceptions in the booking audit.");
} finally {
  await browser.close();
}

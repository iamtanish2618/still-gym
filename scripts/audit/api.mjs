import assert from "node:assert/strict";
import { adminStatement } from "../create-admin.mjs";
export async function verifyApi({ db, run, password, title, emails, api }) {
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
  return { date, emptySession };
}

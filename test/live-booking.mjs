// Integration audit against the actual HTTP server and D1 binding, never a public deployment.
import assert from "node:assert/strict";
const base = process.env.TEST_URL || "http://127.0.0.1:5174";
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(base))
  throw Error("Use an isolated, freshly seeded local D1 instance.");
const run = Date.now().toString(36);
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
const admin = (
  await api("/auth/login", null, "POST", {
    email: "admin@still.demo",
    password: "StillDemo2026!",
  })
).data.token;
assert.ok(admin, "Fresh local seed required.");
const users = await Promise.all(
  Array.from({ length: 32 }, async (_, i) => {
    const r = await api("/auth/register", null, "POST", {
      name: "D1 Racer " + i,
      email: `d1-${run}-${i}@test.local`,
      password: "LocalAudit2026!",
    });
    assert.equal(r.status, 201);
    return { ...r.data.user, token: r.data.token };
  }),
);
const date = new Date(Date.now() + 14 * 86400000 + 19800000)
  .toISOString()
  .slice(0, 10);
let session;
for (let hour = 0; hour < 24; hour++) {
  const r = await api("/sessions", admin, "POST", {
    date,
    hour,
    title: "D1 concurrency audit",
  });
  if (r.status === 201) {
    session = r.data.session;
    break;
  }
  assert.equal(r.status, 409);
}
assert.ok(session, "No unused audit hour.");
const reserve = (u, kind = "book") =>
  api(`/sessions/${session.id}/${kind}`, u.token, "POST", {});
const cancel = (b, u) => api("/bookings/" + b.id, u.token, "DELETE");
const roster = async () => {
  const r = await api(`/sessions/${session.id}/bookings`, admin);
  assert.equal(r.status, 200);
  return r.data.bookings;
};
const results = await Promise.all(users.map((u) => reserve(u)));
assert.equal(results.filter((r) => r.status === 201).length, 20);
assert.equal(results.filter((r) => r.status === 409).length, 12);
const winners = users.filter((_, i) => results[i].status === 201),
  losers = users.filter((_, i) => results[i].status === 409);
let rows = await roster();
assert.equal(rows.filter((b) => b.status === "confirmed").length, 20);
assert.equal(new Set(rows.map((b) => b.user_id)).size, 20);
assert.equal(new Set(rows.map((b) => b.code)).size, 20);
console.log(
  "PASS: 32 simultaneous HTTP requests to real D1 produce exactly 20 confirmations and 12 conflicts.",
);
const queued = [];
for (const u of losers.slice(0, 4)) {
  const r = await reserve(u, "waitlist");
  assert.equal(r.status, 201);
  queued.push(r.data.booking);
  assert.equal(r.data.booking.position, queued.length);
  assert.equal(r.data.booking.code, null);
}
assert.equal((await reserve(losers[0], "waitlist")).status, 409);
const victim = rows.find((b) => b.user_id === winners[0].id);
const duplicate = await Promise.all([
  cancel(victim, winners[0]),
  cancel(victim, winners[0]),
]);
assert.deepEqual(duplicate.map((r) => r.status).sort(), [200, 409]);
rows = await roster();
assert.equal(rows.find((b) => b.id === queued[0].id).status, "confirmed");
assert.equal(rows.find((b) => b.id === queued[1].id).status, "waitlisted");
const victim2 = rows.find((b) => b.user_id === winners[1].id);
const mix = await Promise.all([
  cancel(queued[1], losers[1]),
  cancel(victim2, winners[1]),
]);
assert.ok(mix.every((r) => r.status === 200));
rows = await roster();
assert.equal(rows.find((b) => b.id === queued[1].id).status, "cancelled");
assert.equal(rows.find((b) => b.id === queued[2].id).status, "confirmed");
const victim3 = rows.find((b) => b.user_id === winners[2].id);
const fair = await Promise.all([
  reserve(losers[4]),
  cancel(victim3, winners[2]),
]);
assert.equal(fair[0].status, 409);
assert.equal(fair[1].status, 200);
rows = await roster();
assert.equal(rows.find((b) => b.id === queued[3].id).status, "confirmed");
assert.equal(rows.filter((b) => b.status === "confirmed").length, 20);
assert.equal((await cancel(victim3, losers[5])).status, 404);
console.log(
  "PASS: duplicate cancellation, concurrent queue departure, FIFO promotion, no queue jumping, ownership and hidden waitlist codes on real D1.",
);
const promoted = rows.find((b) => b.id === queued[0].id);
assert.equal(
  (await api("/check-in", admin, "POST", { code: promoted.code })).status,
  409,
);
await cancel(promoted, losers[0]);
const rebook = await reserve(losers[0]);
assert.equal(rebook.status, 201);
assert.notEqual(rebook.data.booking.code, promoted.code);
const aanya = (
  await api("/auth/login", null, "POST", {
    email: "aanya@still.demo",
    password: "StillDemo2026!",
  })
).data.token;
const active = (await api("/bookings", aanya)).data.bookings.find(
  (b) =>
    b.status === "confirmed" &&
    b.start <= Date.now() &&
    b.start + 3600000 > Date.now() &&
    !b.checked_in_at,
);
assert.ok(active, "Fresh active seed needed for one-time check-in race.");
const check = await Promise.all([
  api("/check-in", admin, "POST", { code: active.code }),
  api("/check-in", admin, "POST", { code: active.code }),
]);
assert.deepEqual(check.map((r) => r.status).sort(), [200, 409]);
assert.equal(
  check.find((r) => r.status === 200).data.booking.name,
  "Aanya Shah",
);
console.log(
  "PASS: cancellation/rebooking changes the code; future check-in fails; concurrent active check-in succeeds exactly once.",
);

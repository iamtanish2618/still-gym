import { test } from "node:test";
import assert from "node:assert/strict";
import { dateKey, time, day, bookingMessage } from "../../app/lib/format.ts";

test("session dates use IST across UTC midnight and month/year boundaries", () => {
  assert.equal(dateKey(Date.parse("2026-12-31T18:29:59Z")), "2026-12-31");
  assert.equal(dateKey(Date.parse("2026-12-31T18:30:00Z")), "2027-01-01");
  assert.equal(dateKey(Date.parse("2028-02-29T18:30:00Z")), "2028-03-01");
  const instant = Date.parse("2026-10-17T03:30:00Z");
  assert.match(time(instant), /9:00\s*am/i);
  assert.match(day(instant), /17/);
});
test("booking messages distinguish confirmation, hidden waitlist code and cancellation", () => {
  assert.match(
    bookingMessage({ status: "confirmed", code: "ABCDEFG2" }),
    /ABCDEFG2/,
  );
  const waiting = bookingMessage({
    status: "waitlisted",
    position: 102,
    code: "PRIVATE2",
  });
  assert.match(waiting, /102/);
  assert.ok(!waiting.includes("PRIVATE2"));
  assert.match(bookingMessage({ status: "cancelled" }), /cancelled/);
});

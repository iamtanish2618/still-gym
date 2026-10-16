import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingCode, passwordHash } from "../../server/auth.mjs";

test("cryptographic codes have valid alphabet and no collisions in sample", () => {
  const values = Array.from({ length: 1000 }, bookingCode);
  assert.equal(new Set(values).size, 1000);
  assert.ok(values.every((v) => /^[A-HJ-NP-Z2-9]{8}$/.test(v)));
});
test("password hashes are salted", async () =>
  assert.notEqual(
    await passwordHash("SamePassword123"),
    await passwordHash("SamePassword123"),
  ));

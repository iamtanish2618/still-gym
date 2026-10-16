import { test, after } from "node:test";
import assert from "node:assert/strict";
import { apiFixture } from "../helpers/api-fixture.mjs";

import { handleApi } from "../../server/api.mjs";
const { db, call, aanya } = await apiFixture();
after(() => db.sqlite.close());
test("malformed inputs and unexpected errors use consistent safe JSON", async () => {
  const malformed = await handleApi(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    }),
    db,
  );
  assert.equal(malformed.status, 400);
  assert.ok((await malformed.json()).error.message);
  assert.equal(
    (
      await call("/sessions/nope/book", {
        token: aanya,
        method: "POST",
        body: {},
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/sessions/999999/book", {
        token: aanya,
        method: "POST",
        body: {},
      })
    ).status,
    404,
  );
  const failure = await handleApi(new Request("http://localhost/api/health"), {
    prepare() {
      throw Error("secret stack details");
    },
  });
  assert.equal(failure.status, 500);
  assert.ok(!JSON.stringify(await failure.json()).includes("secret"));
});

test("unknown private routes stay authenticated and return the consistent 404 format", async () => {
  assert.equal((await call("/missing-route")).status, 401);
  const unknown = await call("/missing-route", { token: aanya });
  assert.equal(unknown.status, 404);
  assert.deepEqual(unknown.data.error, {
    code: "NOT_FOUND",
    message: "Endpoint not found.",
    fields: {},
  });
});

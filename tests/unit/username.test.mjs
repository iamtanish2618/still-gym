import { test } from "node:test";
import assert from "node:assert/strict";
import { database, migrate } from "../helpers/database.mjs";
import { handleApi } from "../../server/api.mjs";

test("chosen usernames normalize, reject invalid/duplicate values, and log in without exposing another account", async () => {
  const db = database();
  migrate(db);
  const call = async (path, body) => {
    const r = await handleApi(
      new Request("https://gym.example/api/auth/" + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      db,
    );
    return { status: r.status, data: await r.json() };
  };
  const input = {
    name: "New Member",
    username: "  My_User  ",
    email: "FIRST@example.org",
    password: "ChosenPassword2026!",
  };
  try {
    const signup = await call("register", input);
    assert.equal(signup.status, 201);
    assert.equal(signup.data.user.username, "my_user");
    assert.equal(signup.data.user.email, "first@example.org");
    assert.equal(signup.data.user.role, "member");
    assert.equal(signup.data.user.password_hash, undefined);
    assert.equal(
      (
        await call("register", {
          ...input,
          email: "second@example.org",
          username: "MY_USER",
        })
      ).status,
      409,
    );
    for (const username of [
      "",
      "ab",
      "a".repeat(25),
      "with space",
      "with@sign",
      "界界界",
    ])
      assert.equal(
        (
          await call("register", {
            ...input,
            username,
            email: "other@example.org",
          })
        ).status,
        422,
      );
    for (const email of ["MY_USER", " FIRST@example.org "]) {
      const login = await call("login", { email, password: input.password });
      assert.equal(login.status, 200);
      assert.equal(login.data.user.id, signup.data.user.id);
    }
    assert.equal(
      (await call("login", { email: "my_user", password: "WrongPassword123" }))
        .status,
      401,
    );
    assert.equal(
      (await call("login", { email: "missing_user", password: input.password }))
        .status,
      401,
    );
  } finally {
    db.sqlite.close();
  }
});

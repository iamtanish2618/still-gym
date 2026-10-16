import { database, migrate } from "./database.mjs";
import { handleApi } from "../../server/api.mjs";
import { seed } from "../fixtures/demo-seed.mjs";
import { hashToken } from "../../server/auth.mjs";
export async function apiFixture() {
  const db = database();
  migrate(db);
  await seed(db);
  const call = async (path, { token, method = "GET", body } = {}) => {
    const r = await handleApi(
      new Request("http://localhost/api" + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
      db,
    );
    return { status: r.status, data: await r.json() };
  };
  const login = async (email) =>
    (
      await call("/auth/login", {
        method: "POST",
        body: { email, password: "StillDemo2026!" },
      })
    ).data.token;
  const admin = await login("admin@still.demo"),
    aanya = await login("aanya@still.demo"),
    kabir = await login("kabir@still.demo");
  const future =
    Math.floor((Date.now() + 19800000) / 86400000) * 86400000 -
    19800000 +
    8 * 86400000;
  const session = (id) =>
    db.sqlite
      .prepare("INSERT INTO sessions(id,start,title) VALUES(?,?,?)")
      .run(id, future + (id - 100) * 3600000, "Test session");
  async function userToken(i) {
    const user = db.sqlite
      .prepare(
        "INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'member') RETURNING id",
      )
      .get(`Racer ${i}`, `race${i}@test.local`, "unused");
    const token = crypto.randomUUID().replaceAll("-", "").repeat(2);
    db.sqlite
      .prepare("INSERT INTO tokens(hash,user_id,expires_at) VALUES(?,?,?)")
      .run(await hashToken(token), user.id, Date.now() + 3600000);
    return { token, id: user.id };
  }
  const racers = await Promise.all(
    Array.from({ length: 32 }, (_, i) => userToken(i)),
  );

  return { db, call, login, admin, aanya, kabir, future, session, racers };
}

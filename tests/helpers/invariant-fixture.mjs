import { database, migrate } from "../helpers/database.mjs";
import { handleApi } from "../../server/api.mjs";
import { hashToken, randomToken } from "../../server/auth.mjs";

export async function fixture(size = 36) {
  const db = database();
  migrate(db);
  let clock = Math.floor(Date.now() / 1000);
  db.sqlite.function("unixepoch", () => clock);
  const start =
    Math.floor((Date.now() + 19800000) / 3600000) * 3600000 -
    19800000 +
    7 * 86400000;
  db.sqlite
    .prepare("INSERT INTO sessions(id,start,title) VALUES(1,?,?)")
    .run(start, "Invariant session");
  const users = [];
  for (let i = 0; i <= size; i++) {
    const role = i === 0 ? "admin" : "member";
    const u = db.sqlite
      .prepare(
        "INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?) RETURNING id",
      )
      .get("Test " + i, `member${i}@test.local`, "not-used", role);
    const token = randomToken();
    db.sqlite
      .prepare("INSERT INTO tokens(hash,user_id,expires_at) VALUES(?,?,?)")
      .run(await hashToken(token), u.id, Date.now() + 86400000);
    users.push({ id: u.id, token });
  }
  async function call(path, user = 1, method = "GET", body) {
    const r = await handleApi(
      new Request("http://localhost/api" + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + users[user].token,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
      db,
    );
    return { status: r.status, data: await r.json() };
  }
  const book = (u, kind = "book") => call("/sessions/1/" + kind, u, "POST", {});
  const cancel = (id, u) => call("/bookings/" + id, u, "DELETE");
  const row = (id) =>
    db.sqlite.prepare("SELECT * FROM bookings WHERE id=?").get(id);
  const counts = () =>
    db.sqlite
      .prepare(
        "SELECT status,count(*) n FROM bookings WHERE session_id=1 GROUP BY status",
      )
      .all();
  return {
    db,
    start,
    users,
    call,
    book,
    cancel,
    row,
    counts,
    setClock: (ms) => {
      clock = Math.floor(ms / 1000);
    },
    close: () => db.sqlite.close(),
  };
}

import { randomToken, hashToken } from "./auth.mjs";
import { fail, response } from "./http/errors.mjs";
import { publicUser } from "./queries.mjs";
// Request-local context: credentials and roles are never shared between requests.
export function createContext(request, db) {
  const url = new URL(request.url),
    path = url.pathname.replace(/^\/api/, "").replace(/\/$/, "") || "/",
    method = request.method;
  const unsafe = !["GET", "HEAD", "OPTIONS"].includes(method);
  const origin = request.headers.get("Origin");
  if (unsafe && origin && origin !== url.origin)
    fail(403, "ORIGIN_FORBIDDEN", "Requests must come from this application.");
  const browser = request.headers.get("X-Still-Client") === "browser";
  const cookie = (value, maxAge) =>
    `still_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${url.protocol === "https:" ? "; Secure" : ""}`;
  if (!db) fail(500, "DATABASE_UNAVAILABLE", "The database is unavailable.");
  const query = (sql, ...args) => db.prepare(sql).bind(...args);
  async function throttle(key, max) {
    const now = Date.now(),
      bucket = Math.floor(now / 60000),
      hash = await hashToken(key);
    const row = await query(
      "INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
      `${hash}:${bucket}`,
      now + 120000,
    ).first();
    if (row.count > max)
      fail(429, "RATE_LIMITED", "Too many attempts. Try again in a minute.");
    await query("DELETE FROM rate_limits WHERE expires_at < ?", now).run();
  }
  async function sessionFor(user, status = 200) {
    const token = randomToken();
    await query("DELETE FROM tokens WHERE expires_at<=?", Date.now()).run();
    await query(
      "INSERT INTO tokens(hash,user_id,expires_at) VALUES(?,?,?)",
      await hashToken(token),
      user.id,
      Date.now() + 7 * 86400000,
    ).run();
    return response(
      { user: publicUser(user), ...(browser ? {} : { token }) },
      status,
      browser ? { "Set-Cookie": cookie(token, 7 * 86400) } : {},
    );
  }
  return {
    request,
    db,
    url,
    path,
    method,
    unsafe,
    origin,
    browser,
    cookie,
    query,
    throttle,
    sessionFor,
  };
}

import { response } from "../http/errors.mjs";

import { publicUser } from "../queries.mjs";

export async function identity({
  path,
  method,
  user,
  query,
  tokenHash,
  browser,
  cookie,
}) {
  if (path === "/auth/me" && method === "GET")
    return response({ user: publicUser(user) });
  if (path === "/auth/logout" && method === "POST") {
    await query("DELETE FROM tokens WHERE hash=?", tokenHash).run();
    return response(
      { ok: true },
      200,
      browser ? { "Set-Cookie": cookie("", 0) } : {},
    );
  }
}

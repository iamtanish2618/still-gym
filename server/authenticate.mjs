import { hashToken } from "./auth.mjs";
import { fail } from "./http/errors.mjs";
export async function authenticate({
  request,
  unsafe,
  origin,
  url,
  browser,
  query,
}) {
  const bearer = request.headers
    .get("Authorization")
    ?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  const cookieToken = request.headers
    .get("Cookie")
    ?.match(/(?:^|;\s*)still_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  const token = bearer || cookieToken;
  if (!token) fail(401, "UNAUTHENTICATED", "Please log in to continue.");
  if (!bearer && unsafe && (origin !== url.origin || !browser))
    fail(
      403,
      "CSRF_FORBIDDEN",
      "Use this application's authenticated controls.",
    );
  const tokenHash = await hashToken(token);
  const user = await query(
    "SELECT u.* FROM tokens t JOIN users u ON u.id=t.user_id WHERE t.hash=? AND t.expires_at>?",
    tokenHash,
    Date.now(),
  ).first();
  if (!user)
    fail(
      401,
      "UNAUTHENTICATED",
      "Your session has expired. Please log in again.",
    );
  const admin = () => {
    if (user.role !== "admin")
      fail(403, "FORBIDDEN", "Only gym staff can do that.");
  };
  return { user, admin, tokenHash };
}

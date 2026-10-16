import { fail, response, invalid } from "../http/errors.mjs";
import { body } from "../http/body.mjs";

export async function checkin({
  path,
  method,
  admin,
  throttle,
  user,
  request,
  query,
}) {
  if (path === "/check-in" && method === "POST") {
    admin();
    await throttle(`check-in:${user.id}`, 30);
    const data = await body(request);
    if (
      typeof data.code !== "string" ||
      !/^[A-HJ-NP-Z2-9]{8}$/.test(data.code.trim().toUpperCase())
    )
      invalid({ code: "Enter the eight-character booking code." });
    const code = data.code.trim().toUpperCase(),
      now = Date.now();
    const updated = await query(
      `UPDATE bookings SET checked_in_at=? WHERE code=? AND status='confirmed' AND checked_in_at IS NULL AND EXISTS (SELECT 1 FROM sessions s WHERE s.id=session_id AND s.start<=unixepoch()*1000 AND s.start+3600000>unixepoch()*1000) RETURNING id`,
      now,
      code,
    ).first();
    if (!updated)
      fail(
        409,
        "INVALID_CHECK_IN",
        "Code unavailable: it may be used, cancelled, incorrect, or outside its session hour.",
      );
    return response({
      booking: await query(
        "SELECT b.id,b.checked_in_at,u.name,u.email,s.title,s.start FROM bookings b JOIN users u ON u.id=b.user_id JOIN sessions s ON s.id=b.session_id WHERE b.id=?",
        updated.id,
      ).first(),
    });
  }
}

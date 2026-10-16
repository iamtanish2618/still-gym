import { fail, response } from "../http/errors.mjs";
import { body } from "../http/body.mjs";
import { id } from "../http/validation.mjs";
import { bookingSelect } from "../queries.mjs";
import { bookingCode } from "../auth.mjs";
export async function bookings({
  path,
  method,
  query,
  user,
  admin,
  request,
  throttle,
}) {
  if (path === "/bookings" && method === "GET")
    return response({
      bookings: (
        await query(
          `${bookingSelect} WHERE b.user_id=? ORDER BY s.start,b.id`,
          user.id,
        ).all()
      ).results,
      serverTime: Date.now(),
    });
  let match = path.match(/^\/sessions\/([^/]+)\/(book|waitlist|bookings)$/);
  if (match) {
    const sessionId = id(match[1]),
      action = match[2];
    if (action === "bookings") {
      admin();
      if (method !== "GET") fail(405, "METHOD_NOT_ALLOWED", "Use GET.");
    } else {
      // Members and staff may book their own place; staff-only actions still use admin().
      if (method !== "POST") fail(405, "METHOD_NOT_ALLOWED", "Use POST.");
    }
    const session = await query(
      "SELECT * FROM sessions WHERE id=?",
      sessionId,
    ).first();
    if (!session) fail(404, "NOT_FOUND", "Session not found.");
    if (action === "bookings")
      return response({
        session,
        bookings: (
          await query(
            `SELECT b.id,b.status,b.code,b.checked_in_at,b.user_id,u.name,u.email FROM bookings b JOIN users u ON u.id=b.user_id WHERE b.session_id=? ORDER BY b.id`,
            sessionId,
          ).all()
        ).results,
      });
    await body(request);
    await throttle(`booking:${user.id}`, 40);
    const status = action === "book" ? "confirmed" : "waitlisted";
    // A database trigger checks capacity inside this atomic statement; no read/write race.
    let created;
    // The unique index remains authoritative. A rare random code collision
    // retries only the aborted insert, never a capacity or member conflict.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        created = await query(
          "INSERT INTO bookings(user_id,session_id,status,code,created_at) VALUES(?,?,?,?,?) RETURNING id",
          user.id,
          sessionId,
          status,
          bookingCode(),
          Date.now(),
        ).first();
        break;
      } catch (e) {
        const detail = `${e?.message || ""} ${e?.cause?.message || ""}`;
        if (!detail.includes("UNIQUE constraint failed: bookings.code"))
          throw e;
        if (attempt === 2)
          fail(
            503,
            "CODE_UNAVAILABLE",
            "Could not assign a booking code. Please try again.",
          );
      }
    }
    return response(
      {
        booking: await query(
          `${bookingSelect} WHERE b.id=?`,
          created.id,
        ).first(),
      },
      201,
    );
  }
  match = path.match(/^\/bookings\/([^/]+)$/);
  if (match && method === "DELETE") {
    const bookingId = id(match[1]),
      booking = await query(
        "SELECT * FROM bookings WHERE id=?",
        bookingId,
      ).first();
    if (!booking || booking.user_id !== user.id)
      fail(404, "NOT_FOUND", "Booking not found.");
    const updated = await query(
      `UPDATE bookings SET status='cancelled' WHERE id=? AND user_id=? AND status IN ('confirmed','waitlisted') AND (SELECT start FROM sessions WHERE id=session_id)>unixepoch()*1000 RETURNING id`,
      bookingId,
      user.id,
    ).first();
    if (!updated)
      fail(
        409,
        "CANNOT_CANCEL",
        "This booking is already cancelled or its session has started.",
      );
    return response({ ok: true });
  }
}

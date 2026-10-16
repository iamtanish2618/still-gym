import { response, invalid } from "../http/errors.mjs";
import { body } from "../http/body.mjs";
import { dateStart } from "../http/validation.mjs";

export async function sessions({
  path,
  method,
  url,
  query,
  user,
  admin,
  request,
}) {
  if (path === "/sessions" && method === "GET") {
    const date = url.searchParams.get("date"),
      start = date ? dateStart(date) : Date.now() - 3600000,
      end = date ? start + 86400000 : start + 90 * 86400000;
    const result = await query(
      `SELECT s.*,20-(SELECT count(*) FROM bookings b WHERE b.session_id=s.id AND b.status='confirmed') AS remaining,
   (SELECT count(*) FROM bookings b WHERE b.session_id=s.id AND b.status='waitlisted') AS waiting,
   (SELECT b.status FROM bookings b WHERE b.session_id=s.id AND b.user_id=? AND b.status!='cancelled') AS my_status
   FROM sessions s WHERE s.start>=? AND s.start<? ORDER BY s.start LIMIT 240`,
      user.id,
      start,
      end,
    ).all();
    return response({ sessions: result.results, serverTime: Date.now() });
  }
  if (path === "/sessions" && method === "POST") {
    admin();
    const data = await body(request),
      start = dateStart(data.date);
    if (!Number.isInteger(data.hour) || data.hour < 0 || data.hour > 23)
      invalid({ hour: "Choose an hour from 00 to 23." });
    if (data.capacity !== undefined && data.capacity !== 20)
      invalid({ capacity: "Every session has exactly 20 mats." });
    const at = start + data.hour * 3600000;
    if (at <= Date.now()) invalid({ date: "Create a session in the future." });
    if (at > Date.now() + 366 * 86400000)
      invalid({ date: "Choose a date within the next year." });
    const title = data.title === undefined ? "Open practice" : data.title;
    if (
      typeof title !== "string" ||
      title.trim().length < 2 ||
      title.trim().length > 48
    )
      invalid({ title: "Use between 2 and 48 characters." });
    return response(
      {
        session: await query(
          "INSERT INTO sessions(start,capacity,title) VALUES(?,20,?) RETURNING *",
          at,
          title.trim(),
        ).first(),
      },
      201,
    );
  }
}

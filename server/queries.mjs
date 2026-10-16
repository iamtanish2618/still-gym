export const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  username: u.username ?? null,
  role: u.role,
});
export const bookingSelect = `SELECT b.id,b.session_id,b.status,b.created_at,b.checked_in_at,s.start,s.title,
 CASE WHEN b.status='confirmed' THEN b.code ELSE NULL END AS code,
 CASE WHEN b.status='waitlisted' THEN (SELECT count(*) FROM bookings q WHERE q.session_id=b.session_id AND q.status='waitlisted' AND q.id<=b.id) ELSE NULL END AS position
 FROM bookings b JOIN sessions s ON s.id=b.session_id`;

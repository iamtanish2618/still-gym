// Refuse cleanup if a real member booked an audit session; never delete their record.
export async function cleanupAudit({ db, emails, title }) {
  const placeholders = emails.map(() => "?").join(",");
  const auditUsers = `SELECT id FROM users WHERE email IN (${placeholders})`;
  const sessions = (
    await db.prepare("SELECT id FROM sessions WHERE title=?").bind(title).all()
  ).results;
  const foreign = await db
    .prepare(
      `SELECT count(*) n FROM bookings WHERE session_id IN (SELECT id FROM sessions WHERE title=?) AND user_id NOT IN (${auditUsers})`,
    )
    .bind(title, ...emails)
    .first();
  if (foreign.n)
    throw Error(
      "An external member used an audit session. Audit records preserved for manual review.",
    );
  await db.batch([
    db
      .prepare(`DELETE FROM bookings WHERE user_id IN (${auditUsers})`)
      .bind(...emails),
    db
      .prepare(`DELETE FROM tokens WHERE user_id IN (${auditUsers})`)
      .bind(...emails),
    db
      .prepare(`DELETE FROM users WHERE email IN (${placeholders})`)
      .bind(...emails),
    ...sessions.map((s) =>
      db
        .prepare("DELETE FROM sessions WHERE id=? AND title=?")
        .bind(s.id, title),
    ),
  ]);
  console.log(
    "Generated audit accounts, tokens, sessions and bookings removed. Other records were untouched.",
  );
}

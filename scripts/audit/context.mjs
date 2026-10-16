import { randomBytes } from "node:crypto";
import { getDatabase } from "../../server/database.mjs";
export async function createAuditContext(base) {
  const db = await getDatabase(),
    run = randomBytes(6).toString("hex"),
    password = randomBytes(24).toString("base64url");
  const title = `Deployment audit ${run}`;
  const emails = Array.from(
    { length: 35 },
    (_, i) => `audit-${run}-${i}@still.invalid`,
  );
  const api = async (path, token, method = "GET", body) => {
    const r = await fetch(base + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: r.status, data: await r.json() };
  };
  return { base, db, run, password, title, emails, api };
}

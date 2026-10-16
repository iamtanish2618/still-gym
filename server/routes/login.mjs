import { fail, invalid } from "../http/errors.mjs";
import { body } from "../http/body.mjs";

import { passwordHash, verifyPassword } from "../auth.mjs";
export async function login({
  path,
  method,
  request,
  throttle,
  query,
  sessionFor,
}) {
  if (["/auth/register", "/auth/login"].includes(path) && method === "POST") {
    const data = await body(request),
      email =
        typeof data.email === "string" ? data.email.trim().toLowerCase() : "",
      password = data.password,
      fields = {};
    const registering = path.endsWith("register");
    const username =
      typeof data.username === "string"
        ? data.username.trim().toLowerCase()
        : "";
    if (
      registering &&
      (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    )
      fields.email = "Enter a valid email address.";
    if (!registering && (!email || email.length > 254))
      fields.email = "Enter your email or username.";
    if (registering && !/^[a-z0-9_]{3,24}$/.test(username))
      fields.username = "Use 3–24 letters, numbers or underscores.";
    if (
      typeof password !== "string" ||
      password.length < 10 ||
      password.length > 128
    )
      fields.password = "Use between 10 and 128 characters.";
    if (Object.keys(fields).length) invalid(fields);
    await throttle(`auth:${email}`, 10);
    const ip =
      request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("cf-connecting-ip");
    if (ip) await throttle(`ip:${ip}`, 200);
    if (path.endsWith("register")) {
      if (data.role !== undefined)
        fail(
          403,
          "ROLE_FORBIDDEN",
          "Registration only creates member accounts.",
        );
      if (
        typeof data.name !== "string" ||
        data.name.trim().length < 2 ||
        data.name.trim().length > 60
      )
        invalid({ name: "Use between 2 and 60 characters." });
      const hash = await passwordHash(password);
      const user = await query(
        "INSERT INTO users(name,email,username,password_hash,role) VALUES(?,?,?,?,'member') RETURNING id,name,email,username,role",
        data.name.trim(),
        email,
        username,
        hash,
      ).first();
      return sessionFor(user, 201);
    }
    const user = await query(
      "SELECT * FROM users WHERE email=? OR username=?",
      email,
      email,
    ).first();
    const valid = user
      ? await verifyPassword(password, user.password_hash)
      : (await passwordHash(password), false);
    if (!valid)
      fail(
        401,
        "INVALID_CREDENTIALS",
        "Email, username or password is incorrect.",
      );
    return sessionFor(user);
  }
}

const encoder = new TextEncoder();
const hex = (bytes) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (value) =>
  Uint8Array.from(value.match(/../g), (b) => parseInt(b, 16));
export const randomToken = () =>
  hex(crypto.getRandomValues(new Uint8Array(32)));
export const hashToken = async (value) =>
  hex(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
  );
export function bookingCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(
    crypto.getRandomValues(new Uint8Array(8)),
    (b) => alphabet[b & 31],
  ).join("");
}
export async function passwordHash(
  password,
  salt = hex(crypto.getRandomValues(new Uint8Array(16))),
  iterations = 600000,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: unhex(salt), iterations },
    key,
    256,
  );
  return `pbkdf2-sha256$${iterations}$${salt}$${hex(new Uint8Array(bits))}`;
}
export async function verifyPassword(password, stored) {
  if (typeof password !== "string" || typeof stored !== "string") return false;
  const parts = stored.match(
    /^pbkdf2-sha256\$(100000|600000)\$([a-f0-9]{32})\$([a-f0-9]{64})$/,
  );
  if (!parts) return false;
  const actual = await passwordHash(password, parts[2], Number(parts[1]));
  let difference = actual.length ^ stored.length;
  for (let i = 0; i < actual.length; i++)
    difference |= actual.charCodeAt(i) ^ (stored.charCodeAt(i) || 0);
  return difference === 0;
}

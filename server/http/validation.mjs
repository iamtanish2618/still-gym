import { fail, invalid } from "./errors.mjs";
export const id = (value) => {
  if (!/^[1-9]\d{0,9}$/.test(value))
    fail(400, "INVALID_ID", "Invalid identifier.");
  return Number(value);
};
export function dateStart(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    invalid({ date: "Choose a valid date." });
  const n = Date.parse(`${date}T00:00:00+05:30`);
  if (
    !Number.isFinite(n) ||
    new Date(n + 19800000).toISOString().slice(0, 10) !== date
  )
    invalid({ date: "Choose a valid date." });
  return n;
}

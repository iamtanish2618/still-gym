import { ApiError, response } from "./errors.mjs";
export function errorResponse(e) {
  if (e instanceof ApiError)
    return response(
      { error: { code: e.code, message: e.message, fields: e.fields } },
      e.status,
    );
  const message = String(e?.message || "");
  const known = [
    ["SESSION_FULL", "This session is full. Join the waitlist."],
    ["SEATS_AVAILABLE", "A mat is available. Book it directly."],
    ["SESSION_STARTED", "This session has already started."],
    [
      "bookings.user_id, bookings.session_id",
      "You already have a place in this session.",
    ],
    ["users.email", "An account with this email already exists."],
    ["users.username", "That username is already taken. Choose another."],
    ["sessions.start", "A session already starts at this time."],
  ];
  for (const [needle, description] of known)
    if (message.includes(needle))
      return response(
        { error: { code: "CONFLICT", message: description, fields: {} } },
        409,
      );
  console.error("API error", e instanceof Error ? e.name : "Unknown");
  return response(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Please try again.",
        fields: {},
      },
    },
    500,
  );
}

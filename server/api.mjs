import { createContext } from "./context.mjs";
import { authenticate } from "./authenticate.mjs";
import { response, fail } from "./http/errors.mjs";
import { errorResponse } from "./http/error-response.mjs";
import { login } from "./routes/login.mjs";
import { identity } from "./routes/identity.mjs";
import { sessions } from "./routes/sessions.mjs";
import { bookings } from "./routes/bookings.mjs";
import { checkin } from "./routes/checkin.mjs";
export { ApiError } from "./http/errors.mjs";

// Authentication precedes every private handler. Booking invariants remain in
// database constraints/triggers so separate server instances obey the same rules.
export async function handleApi(request, db) {
  try {
    const context = createContext(request, db);
    if (context.path === "/health" && context.method === "GET") {
      await context.query("SELECT 1").first();
      return response({ status: "ok", serverTime: Date.now() });
    }
    const publicResult = await login(context);
    if (publicResult) return publicResult;
    const authenticated = { ...context, ...(await authenticate(context)) };
    for (const handler of [identity, sessions, bookings, checkin]) {
      const result = await handler(authenticated);
      if (result) return result;
    }
    fail(404, "NOT_FOUND", "Endpoint not found.");
  } catch (error) {
    return errorResponse(error);
  }
}

import { handleApi } from "../../../server/api.mjs";
import { getDatabase } from "../../../server/database.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function route(request: Request) {
  // Next normalizes the internal URL to localhost in development. Compare CSRF
  // against the served Host, never a caller-supplied Origin or forwarded host.
  const publicUrl = new URL(request.url);
  publicUrl.host = request.headers.get("host") || publicUrl.host;
  if (process.env.VERCEL) publicUrl.protocol = "https:";
  const publicRequest = new Request(publicUrl, request);
  try {
    return await handleApi(publicRequest, await getDatabase());
  } catch {
    return Response.json(
      {
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The service is temporarily unavailable. Please try again.",
          fields: {},
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export {
  route as DELETE,
  route as GET,
  route as PATCH,
  route as POST,
  route as PUT,
};

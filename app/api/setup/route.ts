import { env } from "cloudflare:workers";
import { seed } from "../../../server/seed.mjs";
export async function POST(request: Request) {
  const key = (env as Cloudflare.Env & { SETUP_KEY?: string }).SETUP_KEY;
  if (!key || request.headers.get("X-Setup-Key") !== key)
    return Response.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "Endpoint not found.",
          fields: {},
        },
      },
      { status: 404 },
    );
  if (!env.DB)
    return Response.json(
      {
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "Database unavailable.",
          fields: {},
        },
      },
      { status: 500 },
    );
  try {
    if (await env.DB.prepare("SELECT id FROM users LIMIT 1").first())
      return Response.json(
        {
          error: {
            code: "ALREADY_INITIALIZED",
            message: "Database already initialized.",
            fields: {},
          },
        },
        { status: 409 },
      );
    return Response.json(await seed(env.DB), { status: 201 });
  } catch {
    return Response.json(
      {
        error: {
          code: "SETUP_FAILED",
          message: "Could not initialize the database.",
          fields: {},
        },
      },
      { status: 500 },
    );
  }
}

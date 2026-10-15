import { env } from "cloudflare:workers";
import { handleApi } from "../../../server/api.mjs";
export const dynamic = "force-dynamic";
const route = (request: Request) => handleApi(request, env.DB);
export {
  route as GET,
  route as POST,
  route as DELETE,
  route as PATCH,
  route as PUT,
};

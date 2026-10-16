import { fail } from "./errors.mjs";
export async function body(request) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    fail(400, "JSON_REQUIRED", "Send a JSON request.");
  const limit = 8192;
  if (Number(request.headers.get("content-length")) > limit)
    fail(400, "BODY_TOO_LARGE", "Request is too large.");
  const chunks = [];
  let size = 0;
  const reader = request.body?.getReader();
  if (reader) {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) {
          await reader.cancel().catch(() => {});
          fail(400, "BODY_TOO_LARGE", "Request is too large.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const data = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw Error();
    return data;
  } catch {
    fail(400, "INVALID_JSON", "Send a valid JSON object.");
  }
}

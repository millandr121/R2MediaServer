import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Throw a JSON error that the global handler renders consistently. */
export function fail(status: ContentfulStatusCode, message: string, code?: string): never {
  throw new HTTPException(status, {
    res: new Response(JSON.stringify({ error: message, code }), {
      status,
      headers: { "content-type": "application/json" },
    }),
  });
}

export const badRequest = (m = "Bad request") => fail(400, m, "bad_request");
export const unauthorized = (m = "Unauthorized") => fail(401, m, "unauthorized");
export const forbidden = (m = "Forbidden") => fail(403, m, "forbidden");
export const notFound = (m = "Not found") => fail(404, m, "not_found");
export const gone = (m = "No longer available") => fail(410, m, "gone");
export const tooManyRequests = (m = "Too many requests") => fail(429, m, "rate_limited");
export const serverError = (m = "Server error") => fail(500, m, "server_error");

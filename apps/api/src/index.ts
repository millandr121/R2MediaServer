import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "./types";

import auth from "./routes/auth";
import folders from "./routes/folders";
import files from "./routes/files";
import shares from "./routes/shares";
import publicShares from "./routes/publicShares";
import stock from "./routes/stock";

const app = new Hono<AppEnv>();

// CORS: echo only allow-listed origins, with credentials for the refresh cookie.
app.use("*", (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : allowed[0] ?? null),
    credentials: true,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["authorization", "content-type", "x-share-key"],
    maxAge: 86400,
  })(c, next);
});

app.get("/api/health", (c) => c.json({ name: "r2-media-server-api", status: "ok" }));

app.route("/api/auth", auth);
app.route("/api/folders", folders);
app.route("/api/files", files);
app.route("/api/shares", shares);
app.route("/api/public/shares", publicShares);
app.route("/api/stock", stock);

// Unmatched API routes always return JSON. Everything else is handled by the
// static site: the React app is served from the ASSETS binding, with SPA
// fallback (deep links like /drive/123 resolve to index.html).
app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));
app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

// Consistent JSON error responses.
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    const res = err.getResponse();
    if (res.headers.get("content-type")?.includes("application/json")) return res;
    return c.json({ error: err.message }, err.status);
  }
  console.error("Unhandled error:", err);
  // TEMP DEBUG: surface the real error to diagnose the signup 500. Revert after.
  const e = err as Error;
  return c.json({ error: `DEBUG ${e?.name ?? "Error"}: ${e?.message ?? String(err)}` }, 500);
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default app;

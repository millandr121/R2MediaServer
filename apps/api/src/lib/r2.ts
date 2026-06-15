import { AwsClient } from "aws4fetch";
import type { Env } from "../types";

/**
 * R2 access lives in two layers:
 *
 *  1. Presigned S3 URLs (this module, via aws4fetch) — handed to the browser so
 *     it uploads/downloads bytes DIRECTLY to/from R2's edge. The Worker never
 *     proxies file data, so even 50GB uploads cost ~zero Worker CPU.
 *
 *  2. The R2 binding (env.BUCKET) — used only for tiny control-plane ops the
 *     server must own: HEAD (verify size after upload), DELETE, list-by-prefix.
 */

const DEFAULT_DOWNLOAD_TTL = 60 * 60; // 1 hour
const DEFAULT_UPLOAD_TTL = 60 * 60; // 1 hour

function endpoint(env: Env): string {
  return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

function makeAws(env: Env): AwsClient {
  return new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  });
}

/** Percent-encode each key segment but keep "/" as a path separator. */
function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

function objectUrl(env: Env, key: string): string {
  return `${endpoint(env)}/${env.R2_BUCKET_NAME}/${encodeKey(key)}`;
}

function extractTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : null;
}

// ---- Single-shot presigned URLs --------------------------------------------

/** Presigned PUT URL for a direct browser upload (objects up to 5 GB). */
export async function presignUpload(
  env: Env,
  key: string,
  contentType?: string,
  expires = DEFAULT_UPLOAD_TTL,
): Promise<string> {
  const aws = makeAws(env);
  const url = new URL(objectUrl(env, key));
  url.searchParams.set("X-Amz-Expires", String(expires));
  const headers: Record<string, string> = {};
  if (contentType) headers["content-type"] = contentType;
  const signed = await aws.sign(url.toString(), {
    method: "PUT",
    headers,
    aws: { signQuery: true },
  });
  return signed.url;
}

/**
 * Presigned GET URL for a direct browser download.
 * When `downloadName` is set, forces a download with that filename.
 */
export async function presignDownload(
  env: Env,
  key: string,
  opts: { downloadName?: string; inline?: boolean; expires?: number } = {},
): Promise<string> {
  const aws = makeAws(env);
  const url = new URL(objectUrl(env, key));
  url.searchParams.set("X-Amz-Expires", String(opts.expires ?? DEFAULT_DOWNLOAD_TTL));
  if (opts.downloadName) {
    const disp = opts.inline ? "inline" : "attachment";
    url.searchParams.set(
      "response-content-disposition",
      `${disp}; filename="${opts.downloadName.replace(/"/g, "")}"`,
    );
  }
  const signed = await aws.sign(url.toString(), { method: "GET", aws: { signQuery: true } });
  return signed.url;
}

// ---- Multipart upload (for large files) ------------------------------------

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

/** Begin an S3 multipart upload; returns the UploadId. */
export async function initiateMultipart(
  env: Env,
  key: string,
  contentType?: string,
): Promise<string> {
  const aws = makeAws(env);
  const headers: Record<string, string> = {};
  if (contentType) headers["content-type"] = contentType;
  const signed = await aws.sign(`${objectUrl(env, key)}?uploads`, {
    method: "POST",
    headers,
    body: "",
  });
  const res = await fetch(signed);
  const xml = await res.text();
  if (!res.ok) throw new Error(`initiateMultipart failed: ${res.status} ${xml}`);
  const uploadId = extractTag(xml, "UploadId");
  if (!uploadId) throw new Error("initiateMultipart: no UploadId in response");
  return uploadId;
}

/** Presigned PUT URL for a single part of a multipart upload. */
export async function presignPart(
  env: Env,
  key: string,
  uploadId: string,
  partNumber: number,
  expires = DEFAULT_UPLOAD_TTL,
): Promise<string> {
  const aws = makeAws(env);
  const url = new URL(objectUrl(env, key));
  url.searchParams.set("partNumber", String(partNumber));
  url.searchParams.set("uploadId", uploadId);
  url.searchParams.set("X-Amz-Expires", String(expires));
  const signed = await aws.sign(url.toString(), { method: "PUT", aws: { signQuery: true } });
  return signed.url;
}

/** Finalize a multipart upload from the collected part ETags. */
export async function completeMultipart(
  env: Env,
  key: string,
  uploadId: string,
  parts: CompletedPart[],
): Promise<void> {
  const aws = makeAws(env);
  const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber);
  const body =
    `<CompleteMultipartUpload>` +
    ordered
      .map((p) => {
        const etag = p.etag.startsWith('"') ? p.etag : `"${p.etag}"`;
        return `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${etag}</ETag></Part>`;
      })
      .join("") +
    `</CompleteMultipartUpload>`;
  const url = `${objectUrl(env, key)}?uploadId=${encodeURIComponent(uploadId)}`;
  const signed = await aws.sign(url, {
    method: "POST",
    headers: { "content-type": "application/xml" },
    body,
  });
  const res = await fetch(signed);
  const text = await res.text();
  // S3 can return 200 with an error embedded in the body.
  if (!res.ok || text.includes("<Error>")) {
    throw new Error(`completeMultipart failed: ${res.status} ${text}`);
  }
}

/** Abort an in-progress multipart upload (cleanup on cancel/error). */
export async function abortMultipart(env: Env, key: string, uploadId: string): Promise<void> {
  const aws = makeAws(env);
  const url = `${objectUrl(env, key)}?uploadId=${encodeURIComponent(uploadId)}`;
  const signed = await aws.sign(url, { method: "DELETE" });
  await fetch(signed).catch(() => {});
}

// ---- Control-plane ops via the R2 binding ----------------------------------

export async function headObject(env: Env, key: string): Promise<R2Object | null> {
  return env.BUCKET.head(key);
}

export async function deleteObject(env: Env, key: string): Promise<void> {
  await env.BUCKET.delete(key);
}

export async function deleteObjects(env: Env, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  // R2 binding delete accepts an array of keys.
  await env.BUCKET.delete(keys);
}

import { createHmac, createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import type { R2Settings } from "./system-settings.js";

type R2RequestOptions = {
  method: "DELETE" | "GET" | "HEAD" | "PUT";
  bucket: string;
  key?: string;
  body?: Buffer;
  contentType?: string;
};

function sha256Hex(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function amzDate(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { full: iso, short: iso.slice(0, 8) };
}

function encodePathSegment(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalPath(bucket: string, key?: string) {
  const bucketPath = encodePathSegment(bucket);
  if (!key) return `/${bucketPath}`;
  return `/${bucketPath}/${key.split("/").map(encodePathSegment).join("/")}`;
}

function signingKey(secret: string, date: string) {
  const dateKey = hmac(`AWS4${secret}`, date);
  const regionKey = hmac(dateKey, "auto");
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

async function signedR2Request(settings: R2Settings, options: R2RequestOptions) {
  const body = options.body ?? Buffer.alloc(0);
  const payloadHash = sha256Hex(body);
  const timestamp = amzDate();
  const host = `${settings.accountId}.r2.cloudflarestorage.com`;
  const path = canonicalPath(options.bucket, options.key);
  const url = `https://${host}${path}`;
  const contentType = options.contentType ?? "application/octet-stream";
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders = [
    `content-type:${contentType}`,
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${timestamp.full}`
  ].join("\n") + "\n";
  const canonicalRequest = [
    options.method,
    path,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join("\n");
  const scope = `${timestamp.short}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    timestamp.full,
    scope,
    sha256Hex(canonicalRequest)
  ].join("\n");
  const signature = hmacHex(signingKey(settings.secretAccessKey, timestamp.short), stringToSign);
  const response = await fetch(url, {
    method: options.method,
    body: options.method === "GET" || options.method === "HEAD" ? undefined : body,
    headers: {
      Authorization: `AWS4-HMAC-SHA256 Credential=${settings.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      "Content-Type": contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": timestamp.full
    }
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const detail = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    throw new Error(detail || `R2 request failed with ${response.status}`);
  }

  return response;
}

export async function ensureR2Bucket(settings: R2Settings) {
  try {
    await signedR2Request(settings, { method: "HEAD", bucket: settings.bucket });
  } catch {
    await signedR2Request(settings, { method: "PUT", bucket: settings.bucket });
  }
}

export async function uploadFileToR2(settings: R2Settings, localPath: string, key: string) {
  const body = readFileSync(localPath);
  await signedR2Request(settings, {
    method: "PUT",
    bucket: settings.bucket,
    key,
    body,
    contentType: "application/octet-stream"
  });
}

export async function downloadR2Object(settings: R2Settings, key: string) {
  const response = await signedR2Request(settings, { method: "GET", bucket: settings.bucket, key });
  return Buffer.from(await response.arrayBuffer());
}

export async function downloadR2ObjectToFile(settings: R2Settings, key: string, localPath: string) {
  writeFileSync(localPath, await downloadR2Object(settings, key));
}

export async function deleteR2Object(settings: R2Settings, key: string) {
  await signedR2Request(settings, { method: "DELETE", bucket: settings.bucket, key });
}

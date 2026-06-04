import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { databaseTypeForService, isDatabaseService } from "./database-urls.js";
import { runRedis } from "./database-redis-viewer.js";
import { type CommandResult, type DatabaseContext } from "./database-viewer-shared.js";
import { containerNameForService, getServiceById } from "./deploy.js";
import { db } from "./db.js";
import { getRailwayServiceVariables } from "./railway-importer.js";
import { getRailwayImportSource } from "./service-import-sources.js";
import { envVars, type Service } from "./schema.js";

const redisImportImage = "redis:7-alpine";

export type RedisDataImportResult = {
  ok: true;
  serviceId: string;
  source: "redis-url" | "railway";
  sourceLabel: string;
  sourceVariableKey?: string;
  dumpSizeBytes: number;
  checksum: string;
  importedAt: string;
};

type RedisUrlCandidate = {
  key: string;
  value: string;
  internal: boolean;
};

function runDocker(args: string[]) {
  return new Promise<CommandResult>((resolvePromise, reject) => {
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
      } else {
        reject(new Error((stderr || stdout || "Docker command failed").trim()));
      }
    });
  });
}

function envMapForService(serviceId: string) {
  const rows = db.select().from(envVars).where(eq(envVars.serviceId, serviceId)).all();
  return new Map(rows.map((row) => [row.key, row.value]));
}

function redisService(serviceId: string) {
  const service = getServiceById(serviceId);
  if (!service || !isDatabaseService(service)) {
    throw new Error("Database service not found");
  }

  const dbType = databaseTypeForService(service);
  if (dbType !== "redis") {
    throw new Error("Redis data import is only available for Redis services.");
  }

  return service;
}

function redisContext(service: Service): DatabaseContext {
  return {
    service,
    dbType: "redis",
    envMap: envMapForService(service.id),
    containerName: containerNameForService(service.id)
  };
}

function parseRedisUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Use a valid Redis connection URL.");
  }

  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
    throw new Error("Use a redis:// or rediss:// connection URL.");
  }
  return parsed;
}

function isRailwayInternalHost(hostname: string) {
  return hostname.endsWith(".railway.internal");
}

function assertReachableSourceUrl(sourceUrl: string) {
  const parsed = parseRedisUrl(sourceUrl);
  if (isRailwayInternalHost(parsed.hostname)) {
    throw new Error("Railway internal Redis URLs are only reachable from inside Railway. Use a public Redis URL instead.");
  }
}

function fileSha256(localPath: string) {
  return createHash("sha256").update(readFileSync(localPath)).digest("hex");
}

function redactUrl(message: string, sourceUrl: string) {
  const parsed = new URL(sourceUrl);
  const redacted = new URL(sourceUrl);
  if (redacted.password) redacted.password = "REDACTED";
  let nextMessage = message.replaceAll(sourceUrl, redacted.toString());
  if (parsed.password) {
    nextMessage = nextMessage.replaceAll(decodeURIComponent(parsed.password), "REDACTED");
  }
  return nextMessage;
}

async function dumpRedisUrl(sourceUrl: string) {
  const tempDir = await mkdtemp(join(tmpdir(), "aeroplane-redis-import-"));
  const dumpPath = join(tempDir, "source.rdb");
  const containerName = `aeroplane-redis-dump-${nanoid(10)}`;
  const remotePath = "/tmp/source.rdb";
  await runDocker(["pull", redisImportImage]);

  try {
    await runDocker(["rm", "-f", containerName]).catch(() => undefined);
    await runDocker([
      "run",
      "--name",
      containerName,
      "--network",
      "host",
      "--env",
      `SOURCE_REDIS_URL=${sourceUrl}`,
      redisImportImage,
      "sh",
      "-lc",
      `set -eu; TLS_ARG=""; case "$SOURCE_REDIS_URL" in rediss://*) TLS_ARG="--tls" ;; esac; redis-cli $TLS_ARG -u "$SOURCE_REDIS_URL" --rdb ${remotePath}; test -s ${remotePath}`
    ]);
    await runDocker(["cp", `${containerName}:${remotePath}`, dumpPath]);
  } catch (error) {
    rmSync(tempDir, { recursive: true, force: true });
    const message = error instanceof Error ? redactUrl(error.message, sourceUrl) : "Could not dump source Redis database";
    throw new Error(message);
  } finally {
    await runDocker(["rm", "-f", containerName]).catch(() => undefined);
  }

  if (!existsSync(dumpPath) || statSync(dumpPath).size === 0) {
    rmSync(tempDir, { recursive: true, force: true });
    throw new Error("Redis dump was not created or was empty.");
  }

  return { tempDir, dumpPath };
}

function delay(ms: number) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function waitForTargetRedis(ctx: DatabaseContext) {
  try {
    await runRedis(ctx, ["PING"]);
  } catch {
    throw new Error("Deploy this Redis service before importing data.");
  }
}

async function waitForRestartedRedis(ctx: DatabaseContext) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      await runRedis(ctx, ["PING"]);
      return;
    } catch {
      await delay(500);
    }
  }

  throw new Error("Redis did not become ready after loading the imported dump.");
}

async function restoreRedisDump(service: Service, dumpPath: string) {
  const ctx = redisContext(service);
  await waitForTargetRedis(ctx);

  await runDocker(["stop", "--time", "30", ctx.containerName]);
  let started = false;
  try {
    await runDocker(["cp", dumpPath, `${ctx.containerName}:/data/dump.rdb`]);
    await runDocker(["start", ctx.containerName]);
    started = true;
    await waitForRestartedRedis(ctx);
  } catch (error) {
    if (!started) {
      await runDocker(["start", ctx.containerName]).catch(() => undefined);
    }
    throw error;
  }
}

async function importRedisDumpedUrl(serviceId: string, sourceUrl: string, source: "redis-url" | "railway", sourceLabel: string, sourceVariableKey?: string) {
  const service = redisService(serviceId);
  assertReachableSourceUrl(sourceUrl);
  const { tempDir, dumpPath } = await dumpRedisUrl(sourceUrl);

  try {
    const stats = statSync(dumpPath);
    const checksum = fileSha256(dumpPath);
    await restoreRedisDump(service, dumpPath);
    return {
      ok: true,
      serviceId,
      source,
      sourceLabel,
      sourceVariableKey,
      dumpSizeBytes: stats.size,
      checksum,
      importedAt: new Date().toISOString()
    } satisfies RedisDataImportResult;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function redisUrlCandidate(key: string, value: unknown): RedisUrlCandidate | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^rediss?:\/\//i.test(trimmed)) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  return {
    key,
    value: trimmed,
    internal: isRailwayInternalHost(parsed.hostname)
  };
}

function publicUrlFromRedisParts(variables: Record<string, string>) {
  const host = (variables.REDISHOST ?? variables.REDIS_HOST ?? "").trim();
  if (!host || isRailwayInternalHost(host)) return null;

  const port = (variables.REDISPORT ?? variables.REDIS_PORT ?? "6379").trim();
  const user = (variables.REDISUSER ?? variables.REDIS_USERNAME ?? "").trim();
  const password = variables.REDISPASSWORD ?? variables.REDIS_PASSWORD ?? "";
  const url = new URL(`redis://${host}:${port}`);
  if (user) url.username = user;
  if (password) url.password = password;
  return url.toString();
}

export function findRailwayRedisUrl(variables: Record<string, string>) {
  const preferredKeys = [
    "REDIS_PUBLIC_URL",
    "DATABASE_PUBLIC_URL",
    "REDIS_TLS_URL",
    "REDIS_URL",
    "DATABASE_URL",
    "REDIS_PRIVATE_URL",
    "DATABASE_PRIVATE_URL"
  ];
  const candidates = preferredKeys
    .map((key) => redisUrlCandidate(key, variables[key]))
    .filter((candidate): candidate is RedisUrlCandidate => Boolean(candidate));
  const publicCandidate = candidates.find((candidate) => !candidate.internal);
  if (publicCandidate) return publicCandidate;

  const partsUrl = publicUrlFromRedisParts(variables);
  if (partsUrl) return { key: "REDISHOST/REDISPORT/REDISUSER/REDISPASSWORD", value: partsUrl, internal: false };

  if (candidates.length > 0) {
    throw new Error("Railway only returned an internal Redis URL. Enable public networking for the Railway database or use the Redis URL option.");
  }

  throw new Error("Could not find a Redis connection URL in the Railway service variables.");
}

export async function importRedisDataFromUrl(serviceId: string, sourceUrl: string) {
  return importRedisDumpedUrl(serviceId, sourceUrl, "redis-url", "Redis URL");
}

export async function importRedisDataFromRailway(serviceId: string, token: string) {
  const source = getRailwayImportSource(serviceId);
  if (!source) {
    throw new Error("This service does not have a saved Railway import source.");
  }
  if (!source.externalProjectId || !source.externalEnvironmentId) {
    throw new Error("This service is missing Railway project or environment metadata.");
  }

  const variables = await getRailwayServiceVariables(token, source.externalProjectId, source.externalEnvironmentId, source.externalServiceId);
  const candidate = findRailwayRedisUrl(variables);
  return importRedisDumpedUrl(
    serviceId,
    candidate.value,
    "railway",
    source.externalServiceName ?? "Railway Redis",
    candidate.key
  );
}

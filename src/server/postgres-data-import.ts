import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { databaseTypeForService, isDatabaseService } from "./database-urls.js";
import { runDockerExec } from "./database-viewer-shared.js";
import { containerNameForService, getServiceById } from "./deploy.js";
import { db } from "./db.js";
import { getRailwayServiceVariables } from "./railway-importer.js";
import { getRailwayImportSource } from "./service-import-sources.js";
import { envVars, type Service } from "./schema.js";

const postgresDumpImage = "postgres:17-alpine";

type CommandResult = {
  stdout: string;
  stderr: string;
};

export type PostgresDataImportResult = {
  ok: true;
  serviceId: string;
  source: "postgres-url" | "railway";
  sourceLabel: string;
  sourceVariableKey?: string;
  dumpSizeBytes: number;
  checksum: string;
  importedAt: string;
};

type PostgresUrlCandidate = {
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

function postgresService(serviceId: string) {
  const service = getServiceById(serviceId);
  if (!service || !isDatabaseService(service)) {
    throw new Error("Database service not found");
  }

  const dbType = databaseTypeForService(service);
  if (dbType !== "postgres") {
    throw new Error("Postgres data import is only available for Postgres services.");
  }

  return service;
}

function parsePostgresUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Use a valid Postgres connection URL.");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("Use a postgres:// or postgresql:// connection URL.");
  }
  return parsed;
}

function isRailwayInternalHost(hostname: string) {
  return hostname.endsWith(".railway.internal");
}

function assertReachableSourceUrl(sourceUrl: string) {
  const parsed = parsePostgresUrl(sourceUrl);
  if (isRailwayInternalHost(parsed.hostname)) {
    throw new Error("Railway internal Postgres URLs are only reachable from inside Railway. Use a public Postgres URL instead.");
  }
}

function fileSha256(localPath: string) {
  return createHash("sha256").update(readFileSync(localPath)).digest("hex");
}

function postgresMajorVersion(versionNum: string) {
  const parsed = Number(versionNum.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed / 10000);
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

async function readSourcePostgresMajor(sourceUrl: string) {
  try {
    const result = await runDocker([
      "run",
      "--rm",
      "--network",
      "host",
      "--env",
      `SOURCE_DATABASE_URL=${sourceUrl}`,
      postgresDumpImage,
      "sh",
      "-lc",
      "psql --dbname=\"$SOURCE_DATABASE_URL\" --tuples-only --no-align --command='SHOW server_version_num'"
    ]);
    return postgresMajorVersion(result.stdout);
  } catch {
    return null;
  }
}

async function dumpPostgresUrl(sourceUrl: string) {
  const tempDir = await mkdtemp(join(tmpdir(), "aeroplane-postgres-import-"));
  const dumpPath = join(tempDir, "source.dump");
  const containerName = `aeroplane-pg-dump-${nanoid(10)}`;
  const remotePath = "/tmp/source.dump";
  await runDocker(["pull", postgresDumpImage]);
  const sourceMajor = await readSourcePostgresMajor(sourceUrl);

  try {
    await runDocker(["rm", "-f", containerName]).catch(() => undefined);
    await runDocker([
      "run",
      "--name",
      containerName,
      "--network",
      "host",
      "--env",
      `SOURCE_DATABASE_URL=${sourceUrl}`,
      postgresDumpImage,
      "sh",
      "-lc",
      `set -eu; pg_dump --dbname="$SOURCE_DATABASE_URL" --format=custom --no-owner --no-acl --file=${remotePath}; test -s ${remotePath}`
    ]);
    await runDocker(["cp", `${containerName}:${remotePath}`, dumpPath]);
  } catch (error) {
    rmSync(tempDir, { recursive: true, force: true });
    const message = error instanceof Error ? redactUrl(error.message, sourceUrl) : "Could not dump source Postgres database";
    throw new Error(message);
  } finally {
    await runDocker(["rm", "-f", containerName]).catch(() => undefined);
  }

  if (!existsSync(dumpPath) || statSync(dumpPath).size === 0) {
    rmSync(tempDir, { recursive: true, force: true });
    throw new Error("Postgres dump was not created or was empty.");
  }

  return { tempDir, dumpPath, sourceMajor };
}

async function readTargetPostgresMajor(service: Service, envMap: Map<string, string>, containerName: string) {
  const user = envMap.get("POSTGRES_USER") || "postgres";
  const password = envMap.get("POSTGRES_PASSWORD") || "";
  const dbName = envMap.get("POSTGRES_DB") || "aeroplane";
  const result = await runDockerExec(
    containerName,
    [
      "psql",
      "-h",
      "127.0.0.1",
      "-p",
      String(service.internalPort),
      "-U",
      user,
      "-d",
      dbName,
      "--tuples-only",
      "--no-align",
      "--command=SHOW server_version_num"
    ],
    { PGPASSWORD: password }
  );
  return postgresMajorVersion(result.stdout);
}

async function waitForTargetPostgres(service: Service, containerName: string, user: string) {
  try {
    await runDockerExec(containerName, ["pg_isready", "-h", "127.0.0.1", "-p", String(service.internalPort), "-U", user]);
  } catch {
    throw new Error("Deploy this Postgres service before importing data.");
  }
}

async function restorePostgresDump(service: Service, dumpPath: string, sourceMajor: number | null) {
  const envMap = envMapForService(service.id);
  const containerName = containerNameForService(service.id);
  const remotePath = `/tmp/aeroplane-data-import-${nanoid(10)}-${basename(dumpPath)}`;
  const user = envMap.get("POSTGRES_USER") || "postgres";
  const password = envMap.get("POSTGRES_PASSWORD") || "";
  const dbName = envMap.get("POSTGRES_DB") || "aeroplane";

  await waitForTargetPostgres(service, containerName, user);
  const targetMajor = await readTargetPostgresMajor(service, envMap, containerName).catch(() => null);
  if (sourceMajor && targetMajor && targetMajor < sourceMajor) {
    throw new Error(`Target Postgres ${targetMajor} is older than source Postgres ${sourceMajor}. Redeploy this Aeroplane Postgres service with the current image, then run the import again.`);
  }
  await runDocker(["cp", dumpPath, `${containerName}:${remotePath}`]);
  try {
    await runDockerExec(
      containerName,
      [
        "pg_restore",
        "-h",
        "127.0.0.1",
        "-p",
        String(service.internalPort),
        "-U",
        user,
        "-d",
        dbName,
        "--clean",
        "--if-exists",
        "--no-owner",
        "--no-acl",
        remotePath
      ],
      { PGPASSWORD: password }
    );
  } finally {
    await runDockerExec(containerName, ["rm", "-f", remotePath]).catch(() => undefined);
  }
}

async function importPostgresDumpedUrl(serviceId: string, sourceUrl: string, source: "postgres-url" | "railway", sourceLabel: string, sourceVariableKey?: string) {
  assertReachableSourceUrl(sourceUrl);
  const service = postgresService(serviceId);
  const { tempDir, dumpPath, sourceMajor } = await dumpPostgresUrl(sourceUrl);

  try {
    const stats = statSync(dumpPath);
    const checksum = fileSha256(dumpPath);
    await restorePostgresDump(service, dumpPath, sourceMajor);
    return {
      ok: true,
      serviceId,
      source,
      sourceLabel,
      sourceVariableKey,
      dumpSizeBytes: stats.size,
      checksum,
      importedAt: new Date().toISOString()
    } satisfies PostgresDataImportResult;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function postgresUrlCandidate(key: string, value: unknown): PostgresUrlCandidate | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^postgres(ql)?:\/\//i.test(trimmed)) return null;

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

function publicUrlFromPgParts(variables: Record<string, string>) {
  const host = variables.PGHOST?.trim();
  const database = variables.PGDATABASE?.trim();
  const user = variables.PGUSER?.trim();
  const password = variables.PGPASSWORD ?? "";
  if (!host || !database || !user || isRailwayInternalHost(host)) return null;

  const port = variables.PGPORT?.trim() || "5432";
  const url = new URL(`postgresql://${host}:${port}/${database}`);
  url.username = user;
  url.password = password;
  return url.toString();
}

export function findRailwayPostgresUrl(variables: Record<string, string>) {
  const preferredKeys = [
    "POSTGRES_PUBLIC_URL",
    "DATABASE_PUBLIC_URL",
    "POSTGRES_URL",
    "DATABASE_URL",
    "POSTGRES_PRIVATE_URL",
    "DATABASE_PRIVATE_URL"
  ];
  const candidates = preferredKeys
    .map((key) => postgresUrlCandidate(key, variables[key]))
    .filter((candidate): candidate is PostgresUrlCandidate => Boolean(candidate));
  const publicCandidate = candidates.find((candidate) => !candidate.internal);
  if (publicCandidate) return publicCandidate;

  const pgPartsUrl = publicUrlFromPgParts(variables);
  if (pgPartsUrl) return { key: "PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD", value: pgPartsUrl, internal: false };

  if (candidates.length > 0) {
    throw new Error("Railway only returned an internal Postgres URL. Enable public networking for the Railway database or use the Postgres URL option.");
  }

  throw new Error("Could not find a Postgres connection URL in the Railway service variables.");
}

export async function importPostgresDataFromUrl(serviceId: string, sourceUrl: string) {
  return importPostgresDumpedUrl(serviceId, sourceUrl, "postgres-url", "Postgres URL");
}

export async function importPostgresDataFromRailway(serviceId: string, token: string) {
  const source = getRailwayImportSource(serviceId);
  if (!source) {
    throw new Error("This service does not have a saved Railway import source.");
  }
  if (!source.externalProjectId || !source.externalEnvironmentId) {
    throw new Error("This service is missing Railway project or environment metadata.");
  }

  const variables = await getRailwayServiceVariables(token, source.externalProjectId, source.externalEnvironmentId, source.externalServiceId);
  const candidate = findRailwayPostgresUrl(variables);
  return importPostgresDumpedUrl(
    serviceId,
    candidate.value,
    "railway",
    source.externalServiceName ?? "Railway Postgres",
    candidate.key
  );
}

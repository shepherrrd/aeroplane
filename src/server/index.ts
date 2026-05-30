import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { nanoid } from "nanoid";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import net from "node:net";
import dns from "node:dns/promises";
import { networkInterfaces } from "node:os";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { z } from "zod";
import { config } from "./config.js";
import { abortDeployment, allocateHostPort, containerNameForService, enqueueDeployment, getServiceById, removeServiceRuntime, startDeployWorker } from "./deploy.js";
import { db, nowIso } from "./db.js";
import { detectFramework } from "./frameworks.js";
import { resolveServiceEnv } from "./variable-resolver.js";
import { getRailwayProjects, getRailwayProjectDetails, importRailwayProject } from "./railway-importer.js";
import { githubConnectionStatus, listConnectedRepos, listRepoBranches, listRepoDirectories, repoUrlFromFullName } from "./github-connect.js";
import { branchFromGitRef, verifyGitHubSignature } from "./github.js";
import { subscribeToDeploymentLogs } from "./logBus.js";
import { buildDatabaseConnectionUrl, databaseTypeForService, isDatabaseService, publicDatabaseUrlKey, publicDatabaseUrlKeys } from "./database-urls.js";
import {
  deploymentLogs,
  deployments,
  domains,
  envVars,
  projectGroups,
  services,
  type ProjectGroup,
  type Service
} from "./schema.js";
import { getSystemChecks } from "./system.js";
import { writeAndReloadCaddy } from "./caddy.js";
import { syncProjectDatabaseConnectionEnv } from "./database-service-linker.js";
import { createUniqueSlug } from "../shared/slug.js";
import { getSystemSettings, publicR2Settings, saveSystemSettings } from "./system-settings.js";
import { getSystemUpdateInfo, startSystemUpdate } from "./system-updates.js";
import { ensureR2Bucket } from "./r2-storage.js";
import {
  authenticateUser,
  clearSession,
  createOwner,
  createSession,
  getCurrentUser,
  hasAuthUsers,
  publicUser,
  requireAuth
} from "./auth.js";
import { managedEnvPath, writeManagedEnv, writeManagedEnvPatch } from "./env-file.js";
import { generateSecretKey, hasSecretKey } from "./secret-crypto.js";
import {
  createDatabaseBackup,
  deleteDatabaseBackup,
  getDatabaseBackupFile,
  listDatabaseBackups
} from "./database-backups.js";
import {
  deleteDatabaseRow,
  getDatabaseRows,
  getDatabaseTables,
  insertDatabaseRow,
  runDatabaseQuery,
  updateDatabaseRow,
  type DatabaseRowFilter
} from "./database-console.js";

const app = new Hono();

app.use("*", logger());
app.use("/api/*", cors());

const optionalString = z.string().trim().optional().transform((value) => (value ? value : undefined));
const optionalRootDir = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value.replace(/^\/+|\/+$/g, "") : undefined))
  .refine((value) => value === undefined || !value.split("/").includes(".."), { message: "Invalid directory path" });
const repoSchema = z.string().trim().min(1).refine((value) => {
  return value.startsWith("https://") || value.startsWith("git@") || value === "database";
}, {
  message: "Use an HTTPS or SSH Git URL, or database"
});
const repoFullNameSchema = z.string().trim().refine((value) => {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value) || value.startsWith("database:");
}, {
  message: "Choose a GitHub repository or database engine"
});
const hostnameRegex = /^[a-z0-9.-]+\.[a-z]{2,}$|^[a-z0-9-]+\.localhost$/;
const publicHostnameSchema = z.preprocess((value) => {
  if (typeof value !== "string") return undefined;
  const hostname = value.trim().toLowerCase();
  return hostname || undefined;
}, z.string().regex(hostnameRegex, "Use a valid hostname like db.example.com").optional());

const serviceSettingsSchema = z.object({
  name: z.string().trim().min(1),
  repoFullName: repoFullNameSchema.nullish(),
  repoUrl: repoSchema.optional(),
  branch: z.string().trim().min(1).default("main"),
  rootDir: optionalRootDir,
  githubToken: optionalString,
  installCommand: optionalString,
  buildCommand: optionalString,
  startCommand: optionalString,
  staticOutput: optionalString,
  internalPort: z.coerce.number().int().min(1).max(65535).default(8080),
  databasePublicEnabled: z.boolean().optional().default(false),
  databasePublicHostname: publicHostnameSchema
});

const createProjectSchema = z.object({
  name: z.string().trim().min(1),
  description: optionalString
});

const updateProjectSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: optionalString.nullish()
});

const envSchema = z.object({ key: z.string().trim().regex(/^[A-Z_][A-Z0-9_]*$/i), value: z.string() });
const databaseRowValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const databaseRowSchema = z.record(z.string(), databaseRowValueSchema);
const databaseQuerySchema = z.object({ sql: z.string().trim().min(1) });
const databaseFilterOperatorSchema = z.enum([
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "is_empty",
  "is_not_empty",
  "greater_than",
  "less_than"
]);
const databaseRowsFiltersSchema = z.array(z.object({
  column: z.string().trim().min(1),
  operator: databaseFilterOperatorSchema,
  value: z.string().default("")
})).max(12);
const databaseInsertSchema = z.object({
  table: z.string().trim().min(1),
  values: databaseRowSchema
});
const databaseUpdateSchema = z.object({
  table: z.string().trim().min(1),
  primaryKey: databaseRowSchema,
  values: databaseRowSchema
});
const databaseDeleteSchema = z.object({
  table: z.string().trim().min(1),
  primaryKey: databaseRowSchema
});
const backupCreateSchema = z.object({
  storage: z.enum(["disk", "disk+r2"]).default("disk")
});
const r2ConnectionSchema = z.object({
  accountId: z.string().trim().min(1).transform((value) => value.toLowerCase()),
  bucket: z.string().trim().min(1).regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/i, "Use a valid R2 bucket name").transform((value) => value.toLowerCase()),
  accessKeyId: z.string().trim().min(1),
  secretAccessKey: z.string().min(1).optional(),
  createBucket: z.boolean().optional().default(true)
});
const githubSettingsSchema = z.object({
  githubAccessToken: z.string().optional().default(""),
  githubAppId: z.string().trim().optional().default(""),
  githubAppClientId: z.string().trim().optional().default(""),
  githubAppSlug: z.string().trim().optional().default(""),
  githubAppPrivateKey: z.string().optional().default(""),
  githubWebhookSecret: z.string().optional().default("")
});
const loginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1)
});
const setupSchema = z.object({
  owner: z.object({
    name: z.string().trim().min(1),
    email: z.string().trim().email().transform((value) => value.toLowerCase()),
    password: z.string().min(8)
  }),
  env: z.object({
    secretKey: optionalString,
    dataDir: z.string().trim().min(1).default("./data"),
    deployDryRun: z.boolean().default(false),
    caddyConfigPath: z.string().trim().min(1).default("./data/Caddyfile"),
    caddyReloadCmd: z.string().trim().min(1).default("caddy reload --config ./data/Caddyfile"),
    port: z.coerce.number().int().min(1).max(65535).default(4310),
    publicUrl: z.string().trim().min(1).default("http://localhost:5173"),
    controlPlaneHostname: publicHostnameSchema,
    hostPortStart: z.coerce.number().int().min(1).max(65535).default(4100),
    hostPortEnd: z.coerce.number().int().min(1).max(65535).default(4999),
    buildkitHost: z.string().trim().min(1).default("tcp://127.0.0.1:1234"),
    runtimeNetworkName: z.string().trim().min(1).default("aeroplane-runtime"),
    githubAccessToken: optionalString,
    githubAppId: optionalString,
    githubAppClientId: optionalString,
    githubAppSlug: optionalString,
    githubAppPrivateKey: optionalString,
    githubWebhookSecret: optionalString
  }),
  rootDomain: optionalString,
  r2: z.object({
    accountId: optionalString,
    bucket: optionalString,
    accessKeyId: optionalString,
    secretAccessKey: optionalString,
    createBucket: z.boolean().default(true)
  }).optional()
});
const restartOnboardingSchema = setupSchema.pick({
  env: true,
  rootDomain: true,
  r2: true
});

const createServiceSchema = serviceSettingsSchema.extend({
  name: z.string().trim().min(1),
  env: z.array(envSchema).optional().default([])
}).superRefine((value, ctx) => {
  if (value.repoFullName || value.repoUrl) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["repoUrl"],
    message: "Choose a GitHub repository, Git URL, or database"
  });
});

const updateServiceSchema = z.object({
  name: z.string().trim().min(1).optional(),
  repoFullName: repoFullNameSchema.nullish(),
  repoUrl: repoSchema.nullish(),
  branch: z.string().trim().min(1).optional(),
  rootDir: optionalRootDir,
  githubToken: optionalString.nullish(),
  installCommand: optionalString.nullish(),
  buildCommand: optionalString.nullish(),
  startCommand: optionalString.nullish(),
  staticOutput: optionalString.nullish(),
  internalPort: z.coerce.number().int().min(1).max(65535).optional(),
  databasePublicEnabled: z.boolean().optional(),
  databasePublicHostname: publicHostnameSchema
});

function parseDatabaseFilters(raw: string | undefined): DatabaseRowFilter[] {
  if (!raw) return [];
  const parsed = databaseRowsFiltersSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error("Invalid database filters");
  return parsed.data;
}
const domainSchema = z.object({
  hostname: z.string().trim().toLowerCase().regex(hostnameRegex)
});

const searchSchema = z.object({
  service: z.string().optional(),
  tab: z.enum(["deployments", "logs", "environment", "domains", "data", "sql", "backups", "settings"]).optional()
});

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function normalizeRootDomain(value: string | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").replace(/\.+$/, "").replace(/^\*\./, "");
}

function normalizeEnvValue(value: string) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function currentRuntimeConfig() {
  return {
    dataDir: resolve(process.env.DATA_DIR ?? config.dataDir),
    deployDryRun: (process.env.DEPLOY_DRY_RUN ?? String(config.deployDryRun)) === "true",
    caddyConfigPath: resolve(process.env.CADDY_CONFIG_PATH ?? config.caddyConfigPath),
    caddyReloadCmd: process.env.CADDY_RELOAD_CMD ?? config.caddyReloadCmd,
    port: Number(process.env.PORT ?? config.port),
    publicUrl: process.env.PUBLIC_URL ?? config.publicUrl,
    controlPlaneHostname: String(process.env.CONTROL_PLANE_HOSTNAME ?? config.controlPlaneHostname ?? ""),
    hostPortStart: Number(process.env.DEPLOY_HOST_PORT_START ?? config.hostPortStart),
    hostPortEnd: Number(process.env.DEPLOY_HOST_PORT_END ?? config.hostPortEnd),
    buildkitHost: process.env.BUILDKIT_HOST ?? config.buildkitHost,
    runtimeNetworkName: process.env.AEROPLANE_RUNTIME_NETWORK ?? config.runtimeNetworkName
  };
}

type RuntimeLog = {
  id: number;
  line: string;
  stream: string;
  createdAt: string;
};

function parseRuntimeLog(line: string, stream: string, id: number): RuntimeLog {
  const match = line.match(/^(\S+)\s+(.*)$/);
  const timestamp = match ? Date.parse(match[1]) : Number.NaN;

  return {
    id,
    line: match ? match[2] : line,
    stream,
    createdAt: Number.isNaN(timestamp) ? nowIso() : new Date(timestamp).toISOString()
  };
}

function readContainerLogs(containerName: string, tail = 200) {
  return new Promise<RuntimeLog[]>((resolve) => {
    const child = spawn("docker", ["logs", "--timestamps", "--tail", String(tail), containerName], {
      stdio: ["ignore", "pipe", "pipe"]
    });

    const collected: RuntimeLog[] = [];
    let nextId = 1;
    const consume = (stream: "stdout" | "stderr") => (chunk: Buffer) => {
      const lines = chunk
        .toString()
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter(Boolean);

      for (const line of lines) {
        collected.push(parseRuntimeLog(line, stream, nextId));
        nextId += 1;
      }
    };

    child.stdout.on("data", consume("stdout"));
    child.stderr.on("data", consume("stderr"));
    child.on("error", () => resolve([]));
    child.on("close", () => resolve(collected));
  });
}

function getProjectBySlug(projectSlug: string) {
  return db.select().from(projectGroups).where(eq(projectGroups.slug, projectSlug)).get();
}

function getProjectById(projectId: string) {
  return db.select().from(projectGroups).where(eq(projectGroups.id, projectId)).get();
}

function getServicesForProject(projectId: string) {
  return db.select().from(services).where(eq(services.projectId, projectId)).orderBy(asc(services.name)).all();
}

function getProjectSlugSet() {
  return new Set(db.select({ slug: projectGroups.slug }).from(projectGroups).all().map((row) => row.slug));
}

function getServiceSlugSet(projectId: string) {
  return new Set(
    db
      .select({ slug: services.slug })
      .from(services)
      .where(eq(services.projectId, projectId))
      .all()
      .map((row) => row.slug)
  );
}

function checkPortReachable(port: number, host = "127.0.0.1", timeoutMs = 350) {
  return new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

function urlForHostname(hostname: string) {
  const isLocal =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
  return `${isLocal ? "http" : "https"}://${hostname}`;
}

async function publicService(service: Service) {
  const isDatabase = isDatabaseService(service);
  const localUrl = isDatabase ? "" : `http://127.0.0.1:${service.hostPort}`;
  const latestDeployment = db
    .select({ status: deployments.status })
    .from(deployments)
    .where(eq(deployments.serviceId, service.id))
    .orderBy(desc(deployments.createdAt))
    .limit(1)
    .get();
  const shouldProbe = service.status === "active" || service.status === "building";
  const reachable = shouldProbe ? await checkPortReachable(service.hostPort) : false;
  const latestDeploymentIsActive = latestDeployment?.status === "queued" || latestDeployment?.status === "building";
  const liveStatus = service.status === "active" && !reachable && !latestDeploymentIsActive ? "crashed" : service.status;
  const serviceDomains = isDatabase ? [] : db.select().from(domains).where(eq(domains.serviceId, service.id)).orderBy(asc(domains.createdAt)).all();
  const preferredDomain =
    serviceDomains.find((domain) => domain.status === "active") ??
    serviceDomains.find((domain) => Boolean(domain.hostname));
  const primaryUrl = isDatabase ? "" : preferredDomain ? urlForHostname(preferredDomain.hostname) : localUrl;
  const preferredDomainPayload = preferredDomain
    ? { hostname: preferredDomain.hostname, status: preferredDomain.status }
    : null;
  const framework = await detectFramework(service.repoFullName, service.branch, service.rootDir);

  return {
    id: service.id,
    projectId: service.projectId,
    name: service.name,
    slug: service.slug,
    repoFullName: service.repoFullName,
    repoUrl: service.repoUrl,
    branch: service.branch,
    rootDir: service.rootDir,
    hasGithubToken: Boolean(service.githubToken),
    installCommand: service.installCommand,
    buildCommand: service.buildCommand,
    startCommand: service.startCommand,
    staticOutput: service.staticOutput,
    internalPort: service.internalPort,
    hostPort: service.hostPort,
    databasePublicEnabled: Boolean(service.databasePublicEnabled),
    databasePublicHostname: service.databasePublicHostname,
    status: liveStatus,
    reachable,
    localUrl,
    primaryUrl,
    preferredDomain: preferredDomainPayload,
    framework,
    lastDeployedAt: service.lastDeployedAt,
    createdAt: service.createdAt,
    updatedAt: service.updatedAt
  };
}

async function summarizeProject(project: ProjectGroup, projectServices: Service[]) {
  const hydratedServices = await Promise.all(projectServices.map((service) => publicService(service)));
  const statuses = hydratedServices.map((service) => service.status);
  const status = statuses.includes("building")
    ? "building"
    : statuses.includes("failed") || statuses.includes("crashed")
      ? "degraded"
      : statuses.every((value) => value === "active")
        ? "active"
        : "idle";

  const lastUpdatedAt = [...projectServices]
    .map((service) => service.lastDeployedAt ?? service.updatedAt)
    .sort()
    .at(-1) ?? project.updatedAt;

  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    description: project.description,
    status,
    serviceCount: projectServices.length,
    lastUpdatedAt,
    services: hydratedServices
  };
}

function createServiceRecord(projectId: string, input: z.infer<typeof createServiceSchema>) {
  const timestamp = nowIso();
  const serviceSlug = createUniqueSlug(input.name, getServiceSlugSet(projectId));
  const repoFullName = input.repoFullName ?? null;
  const repoUrl = input.repoUrl ?? (repoFullName ? repoUrlFromFullName(repoFullName) : "");
  const isDatabase = repoUrl === "database" || (repoFullName?.startsWith("database:") ?? false);

  const service: Service = {
    id: nanoid(10),
    projectId,
    slug: serviceSlug,
    name: input.name,
    repoFullName,
    repoUrl,
    branch: input.branch,
    rootDir: input.rootDir ?? null,
    githubToken: input.githubToken ?? null,
    webhookSecret: randomBytes(24).toString("hex"),
    installCommand: input.installCommand ?? null,
    buildCommand: input.buildCommand ?? null,
    startCommand: input.startCommand ?? null,
    staticOutput: input.staticOutput ?? null,
    internalPort: input.internalPort,
    hostPort: allocateHostPort(),
    activePort: null,
    databasePublicEnabled: isDatabase ? input.databasePublicEnabled : false,
    databasePublicHostname: isDatabase && input.databasePublicEnabled ? input.databasePublicHostname ?? null : null,
    status: "idle",
    lastDeployedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  db.insert(services).values(service).run();

  const systemSettings = getSystemSettings();
  if (systemSettings.rootDomain && !isDatabaseService(service)) {
    const defaultHostname = `${serviceSlug}.${systemSettings.rootDomain}`;
    db.insert(domains)
      .values({
        id: nanoid(10),
        serviceId: service.id,
        hostname: defaultHostname,
        status: "pending",
        createdAt: timestamp,
        updatedAt: timestamp
      })
      .run();
  }
  if (input.env.length > 0) {
    const timestamp = nowIso();
    const uniqueEnv = new Map<string, string>();
    for (const entry of input.env) {
      uniqueEnv.set(entry.key, normalizeEnvValue(entry.value));
    }

    db.insert(envVars)
      .values(
        Array.from(uniqueEnv.entries()).map(([key, value]) => ({
          id: nanoid(10),
          serviceId: service.id,
          key,
          value,
          createdAt: timestamp,
          updatedAt: timestamp
        }))
      )
      .run();
  }

  syncDatabaseUrlEnvVar(service.id);

  return service;
}

function syncDatabaseUrlEnvVar(serviceId: string) {
  const service = getServiceById(serviceId);
  if (!service) return;
  if (!isDatabaseService(service)) return;

  const dbType = databaseTypeForService(service);
  const envs = db.select().from(envVars).where(eq(envVars.serviceId, serviceId)).all();
  const envMap = new Map(envs.map(row => [row.key, row.value]));
  const privateUrl = buildDatabaseConnectionUrl({
    dbType,
    envMap,
    host: service.slug,
    port: service.internalPort
  });

  if (envMap.get(privateUrl.key) !== privateUrl.value) {
    const timestamp = nowIso();
    db.insert(envVars)
      .values({
        id: nanoid(10),
        serviceId,
        key: privateUrl.key,
        value: privateUrl.value,
        createdAt: timestamp,
        updatedAt: timestamp
      })
      .onConflictDoUpdate({
        target: [envVars.serviceId, envVars.key],
        set: { value: privateUrl.value, updatedAt: timestamp }
      })
      .run();
  }

  const publicUrl = service.databasePublicEnabled && service.databasePublicHostname
    ? buildDatabaseConnectionUrl({
        dbType,
        envMap,
        host: service.databasePublicHostname,
        port: service.hostPort
      }).value
    : "";
  const publicKey = publicDatabaseUrlKey(dbType);

  if (publicUrl) {
    const timestamp = nowIso();
    db.insert(envVars)
      .values({
        id: nanoid(10),
        serviceId,
        key: publicKey,
        value: publicUrl,
        createdAt: timestamp,
        updatedAt: timestamp
      })
      .onConflictDoUpdate({
        target: [envVars.serviceId, envVars.key],
        set: { value: publicUrl, updatedAt: timestamp }
      })
      .run();
  }

  for (const key of publicDatabaseUrlKeys) {
    if (key !== publicKey && envMap.has(key)) {
      db.delete(envVars).where(and(eq(envVars.serviceId, serviceId), eq(envVars.key, key))).run();
    } else if (!publicUrl && envMap.has(key)) {
      db.delete(envVars).where(and(eq(envVars.serviceId, serviceId), eq(envVars.key, key))).run();
    }
  }
}

function syncAllExistingDatabaseUrls() {
  try {
    const allServices = db.select().from(services).all();
    for (const service of allServices) {
      if (isDatabaseService(service)) {
        syncDatabaseUrlEnvVar(service.id);
      }
    }
  } catch (error) {
    console.error("Failed to run retroactive database URL sync:", error);
  }
}

function publicAuthStatus(c: Parameters<typeof getCurrentUser>[0]) {
  const setupComplete = hasAuthUsers();
  const user = setupComplete ? getCurrentUser(c) : null;
  return {
    setupComplete,
    authenticated: Boolean(user),
    user,
    secretKeyConfigured: hasSecretKey(),
    envPath: managedEnvPath(),
    publicIp: cachedPublicIp,
    runtimeConfig: currentRuntimeConfig()
  };
}

function currentGithubEnv() {
  return {
    githubAccessToken: process.env.GITHUB_ACCESS_TOKEN ?? config.githubAccessToken,
    githubAppId: process.env.GITHUB_APP_ID ?? config.githubAppId,
    githubAppClientId: process.env.GITHUB_APP_CLIENT_ID ?? config.githubAppClientId,
    githubAppSlug: process.env.GITHUB_APP_SLUG ?? config.githubAppSlug,
    githubAppPrivateKey: (process.env.GITHUB_APP_PRIVATE_KEY ?? config.githubAppPrivateKey).replace(/\\n/g, "\n"),
    githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET ?? config.githubWebhookSecret
  };
}

function secretSuffix(value: string) {
  return value ? value.slice(-6) : "";
}

async function publicGithubSettings() {
  const env = currentGithubEnv();
  let statusError = "";
  const status = await githubConnectionStatus().catch((error) => {
    statusError = error instanceof Error ? error.message : "Could not check GitHub connection";
    return {
      appConfigured: Boolean(env.githubAppId && env.githubAppPrivateKey),
      connected: false,
      installationCount: 0,
      installed: false,
      installUrl: env.githubAppSlug ? `https://github.com/apps/${env.githubAppSlug}/installations/new` : null,
      mode: env.githubAppId && env.githubAppPrivateKey ? "app" as const : env.githubAccessToken ? "token" as const : "none" as const
    };
  });
  return {
    status,
    statusError,
    settings: {
      githubAccessTokenSuffix: secretSuffix(env.githubAccessToken),
      githubAppId: env.githubAppId,
      githubAppClientId: env.githubAppClientId,
      githubAppSlug: env.githubAppSlug,
      githubAppPrivateKeyConfigured: Boolean(env.githubAppPrivateKey),
      githubWebhookSecretSuffix: secretSuffix(env.githubWebhookSecret),
      envPath: managedEnvPath()
    }
  };
}

function updateGithubRuntimeEnv(values: ReturnType<typeof currentGithubEnv>) {
  process.env.GITHUB_ACCESS_TOKEN = values.githubAccessToken;
  process.env.GITHUB_APP_ID = values.githubAppId;
  process.env.GITHUB_APP_CLIENT_ID = values.githubAppClientId;
  process.env.GITHUB_APP_SLUG = values.githubAppSlug;
  process.env.GITHUB_APP_PRIVATE_KEY = values.githubAppPrivateKey;
  process.env.GITHUB_WEBHOOK_SECRET = values.githubWebhookSecret;

  config.githubAccessToken = values.githubAccessToken;
  config.githubAppId = values.githubAppId;
  config.githubAppClientId = values.githubAppClientId;
  config.githubAppSlug = values.githubAppSlug;
  config.githubAppPrivateKey = values.githubAppPrivateKey;
  config.githubWebhookSecret = values.githubWebhookSecret;
}

function resolveMaskedSecret(input: string, existing: string) {
  const value = input.trim();
  if (value.startsWith("******")) return existing;
  return value;
}

async function applyOnboardingSettings(input: z.infer<typeof restartOnboardingSchema>, options: { generateSecretKeyIfMissing: boolean }) {
  const secretKey = input.env.secretKey || process.env.AEROPLANE_SECRET_KEY || config.secretKey || (options.generateSecretKeyIfMissing ? generateSecretKey() : "");
  const managedEnv = {
    AEROPLANE_SECRET_KEY: secretKey,
    DATA_DIR: input.env.dataDir,
    DEPLOY_DRY_RUN: input.env.deployDryRun,
    CADDY_CONFIG_PATH: input.env.caddyConfigPath,
    CADDY_RELOAD_CMD: input.env.caddyReloadCmd,
    PORT: input.env.port,
    PUBLIC_URL: input.env.publicUrl,
    CONTROL_PLANE_HOSTNAME: input.env.controlPlaneHostname,
    DEPLOY_HOST_PORT_START: input.env.hostPortStart,
    DEPLOY_HOST_PORT_END: input.env.hostPortEnd,
    BUILDKIT_HOST: input.env.buildkitHost,
    AEROPLANE_RUNTIME_NETWORK: input.env.runtimeNetworkName,
    GITHUB_ACCESS_TOKEN: input.env.githubAccessToken ?? process.env.GITHUB_ACCESS_TOKEN,
    GITHUB_APP_ID: input.env.githubAppId ?? process.env.GITHUB_APP_ID,
    GITHUB_APP_CLIENT_ID: input.env.githubAppClientId ?? process.env.GITHUB_APP_CLIENT_ID,
    GITHUB_APP_SLUG: input.env.githubAppSlug ?? process.env.GITHUB_APP_SLUG,
    GITHUB_APP_PRIVATE_KEY: input.env.githubAppPrivateKey ?? process.env.GITHUB_APP_PRIVATE_KEY,
    GITHUB_WEBHOOK_SECRET: input.env.githubWebhookSecret ?? process.env.GITHUB_WEBHOOK_SECRET
  };

  const settings = getSystemSettings();
  let r2 = settings.r2 ?? null;
  if (input.r2?.accountId || input.r2?.bucket || input.r2?.accessKeyId || input.r2?.secretAccessKey) {
    const parsedR2 = r2ConnectionSchema.safeParse({
      accountId: input.r2.accountId,
      bucket: input.r2.bucket,
      accessKeyId: input.r2.accessKeyId,
      secretAccessKey: input.r2.secretAccessKey,
      createBucket: input.r2.createBucket
    });
    if (!parsedR2.success) {
      throw new Error(parsedR2.error.issues[0]?.message ?? "Invalid R2 settings");
    }
    if (!parsedR2.data.secretAccessKey) {
      throw new Error("R2 secret access key is required");
    }

    const timestamp = nowIso();
    r2 = {
      accountId: parsedR2.data.accountId,
      bucket: parsedR2.data.bucket,
      accessKeyId: parsedR2.data.accessKeyId,
      secretAccessKey: parsedR2.data.secretAccessKey,
      endpoint: `https://${parsedR2.data.accountId}.r2.cloudflarestorage.com`,
      connectedAt: settings.r2?.connectedAt ?? timestamp,
      updatedAt: timestamp
    };

    if (parsedR2.data.createBucket) {
      await ensureR2Bucket(r2);
    }
  }

  const envPath = writeManagedEnv(managedEnv);
  updateGithubRuntimeEnv(currentGithubEnv());
  saveSystemSettings({
    ...settings,
    rootDomain: input.rootDomain === undefined ? settings.rootDomain : normalizeRootDomain(input.rootDomain),
    r2
  });
  await writeAndReloadCaddy();

  return envPath;
}

app.get("/api/auth/status", (c) => c.json(publicAuthStatus(c)));

app.post("/api/auth/setup", async (c) => {
  if (hasAuthUsers()) {
    return jsonError("Aeroplane has already been set up", 409);
  }

  const body = setupSchema.safeParse(await c.req.json());
  if (!body.success) {
    return jsonError(body.error.issues[0]?.message ?? "Invalid setup");
  }

  let envPath = "";
  try {
    envPath = await applyOnboardingSettings(body.data, { generateSecretKeyIfMissing: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not apply onboarding settings", 400);
  }

  const user = createOwner(body.data.owner);
  createSession(c, user);
  return c.json({ ok: true, user: publicUser(user), envPath, restartRequired: true }, 201);
});

app.post("/api/auth/login", async (c) => {
  if (!hasAuthUsers()) {
    return jsonError("Setup required", 401);
  }

  const body = loginSchema.safeParse(await c.req.json());
  if (!body.success) {
    return jsonError(body.error.issues[0]?.message ?? "Invalid login");
  }

  const user = authenticateUser(body.data.email, body.data.password);
  if (!user) {
    return jsonError("Invalid email or password", 401);
  }

  createSession(c, user);
  return c.json({ ok: true, user: publicUser(user) });
});

app.post("/api/auth/logout", (c) => {
  clearSession(c);
  return c.json({ ok: true });
});

app.use("/api/*", requireAuth);

app.get("/api/health", (c) => c.json({ ok: true }));

app.post("/api/system/onboarding/restart", async (c) => {
  const body = restartOnboardingSchema.safeParse(await c.req.json());
  if (!body.success) {
    return jsonError(body.error.issues[0]?.message ?? "Invalid onboarding settings");
  }

  try {
    const envPath = await applyOnboardingSettings(body.data, { generateSecretKeyIfMissing: false });
    return c.json({ ok: true, envPath, restartRequired: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not apply onboarding settings", 400);
  }
});

app.get("/api/system", async (c) => c.json(await getSystemChecks()));

app.get("/api/system/settings", async (c) => {
  const settings = getSystemSettings();
  const rootDomain = normalizeRootDomain(settings.rootDomain);
  let dnsStatus = "pending";
  let controlPlaneDnsStatus = "pending";
  const controlPlaneHostname = String(process.env.CONTROL_PLANE_HOSTNAME ?? config.controlPlaneHostname ?? "").trim().toLowerCase();
  if (rootDomain) {
    dnsStatus = await checkDomainDns(`dns-test.${rootDomain}`, cachedPublicIp);
  }
  if (controlPlaneHostname) {
    controlPlaneDnsStatus = await checkDomainDns(controlPlaneHostname, cachedPublicIp);
  }
  return c.json({ settings: { rootDomain, controlPlaneHostname }, publicIp: cachedPublicIp, dnsStatus, controlPlaneDnsStatus });
});

app.post("/api/system/settings", async (c) => {
  const body = await c.req.json();
  const settings = getSystemSettings();
  const hasRootDomain = Object.prototype.hasOwnProperty.call(body, "rootDomain");
  const hasControlPlaneHostname = Object.prototype.hasOwnProperty.call(body, "controlPlaneHostname");
  const rootDomain = hasRootDomain ? normalizeRootDomain(String(body.rootDomain ?? "")) : normalizeRootDomain(settings.rootDomain);

  let controlPlaneHostname = String(process.env.CONTROL_PLANE_HOSTNAME ?? config.controlPlaneHostname ?? "").trim().toLowerCase();
  if (hasControlPlaneHostname) {
    const parsed = publicHostnameSchema.safeParse(body.controlPlaneHostname);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "Invalid dashboard domain");
    }
    controlPlaneHostname = parsed.data ?? "";
    writeManagedEnvPatch({ CONTROL_PLANE_HOSTNAME: controlPlaneHostname });
  }

  saveSystemSettings({ ...settings, rootDomain });
  const caddy = await writeAndReloadCaddy();
  return c.json({ ok: true, settings: { rootDomain, controlPlaneHostname }, caddy });
});

app.get("/api/system/r2", (c) => c.json({ r2: publicR2Settings() }));

app.post("/api/system/r2", async (c) => {
  if (!hasSecretKey()) {
    return jsonError("AEROPLANE_SECRET_KEY is required before saving R2 credentials", 409);
  }

  const existing = getSystemSettings();
  const body = r2ConnectionSchema.safeParse(await c.req.json());
  if (!body.success) {
    return jsonError(body.error.issues[0]?.message ?? "Invalid R2 settings");
  }

  const timestamp = nowIso();
  const secretAccessKey = body.data.secretAccessKey || existing.r2?.secretAccessKey;
  const accessKeyId = body.data.accessKeyId.startsWith("******") ? existing.r2?.accessKeyId : body.data.accessKeyId;
  if (!secretAccessKey) {
    return jsonError("Secret access key is required");
  }
  if (!accessKeyId) {
    return jsonError("Access key ID is required");
  }

  const endpoint = `https://${body.data.accountId}.r2.cloudflarestorage.com`;
  const r2 = {
    accountId: body.data.accountId,
    bucket: body.data.bucket,
    accessKeyId,
    secretAccessKey,
    endpoint,
    connectedAt: existing.r2?.connectedAt ?? timestamp,
    updatedAt: timestamp
  };

  if (body.data.createBucket) {
    try {
      await ensureR2Bucket(r2);
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "Could not create or verify R2 bucket", 400);
    }
  }

  saveSystemSettings({ ...existing, r2 });
  return c.json({ ok: true, r2: publicR2Settings({ ...existing, r2 }) });
});

app.delete("/api/system/r2", (c) => {
  saveSystemSettings({ ...getSystemSettings(), r2: null });
  return c.json({ ok: true, r2: publicR2Settings({ rootDomain: getSystemSettings().rootDomain, r2: null }) });
});

app.get("/api/system/github", async (c) => {
  try {
    return c.json(await publicGithubSettings());
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not load GitHub settings", 503);
  }
});

app.post("/api/system/github", async (c) => {
  const body = githubSettingsSchema.safeParse(await c.req.json());
  if (!body.success) {
    return jsonError(body.error.issues[0]?.message ?? "Invalid GitHub settings");
  }

  const existing = currentGithubEnv();
  const next = {
    githubAccessToken: resolveMaskedSecret(body.data.githubAccessToken, existing.githubAccessToken),
    githubAppId: body.data.githubAppId,
    githubAppClientId: body.data.githubAppClientId,
    githubAppSlug: body.data.githubAppSlug,
    githubAppPrivateKey: body.data.githubAppPrivateKey.trim() ? body.data.githubAppPrivateKey.replace(/\\n/g, "\n") : existing.githubAppPrivateKey,
    githubWebhookSecret: resolveMaskedSecret(body.data.githubWebhookSecret, existing.githubWebhookSecret)
  };

  writeManagedEnvPatch({
    GITHUB_ACCESS_TOKEN: next.githubAccessToken,
    GITHUB_APP_ID: next.githubAppId,
    GITHUB_APP_CLIENT_ID: next.githubAppClientId,
    GITHUB_APP_SLUG: next.githubAppSlug,
    GITHUB_APP_PRIVATE_KEY: next.githubAppPrivateKey,
    GITHUB_WEBHOOK_SECRET: next.githubWebhookSecret
  });
  updateGithubRuntimeEnv(next);

  try {
    return c.json({ ok: true, ...(await publicGithubSettings()) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "GitHub settings saved, but status check failed", 503);
  }
});

app.delete("/api/system/github", async (c) => {
  const next = {
    githubAccessToken: "",
    githubAppId: "",
    githubAppClientId: "",
    githubAppSlug: "",
    githubAppPrivateKey: "",
    githubWebhookSecret: ""
  };
  writeManagedEnvPatch({
    GITHUB_ACCESS_TOKEN: "",
    GITHUB_APP_ID: "",
    GITHUB_APP_CLIENT_ID: "",
    GITHUB_APP_SLUG: "",
    GITHUB_APP_PRIVATE_KEY: "",
    GITHUB_WEBHOOK_SECRET: ""
  });
  updateGithubRuntimeEnv(next);

  return c.json({ ok: true, ...(await publicGithubSettings()) });
});

app.get("/api/system/updates", async (c) => c.json(await getSystemUpdateInfo()));

app.post("/api/system/updates/apply", (c) => c.json({ ok: true, updateRun: startSystemUpdate() }));

app.get("/api/github/status", async (c) => {
  try {
    return c.json(await githubConnectionStatus());
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not load GitHub status", 503);
  }
});

app.get("/api/github/repos", async (c) => {
  try {
    return c.json({ repos: await listConnectedRepos(c.req.query("q")) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not load repositories", 503);
  }
});

app.get("/api/github/branches", async (c) => {
  const repoFullName = c.req.query("repo");
  if (!repoFullName) {
    return jsonError("Missing repo");
  }

  try {
    return c.json({ branches: await listRepoBranches(repoFullName) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not load branches", 503);
  }
});

app.get("/api/github/directories", async (c) => {
  const repoFullName = c.req.query("repo");
  const branch = c.req.query("branch");
  if (!repoFullName || !branch) {
    return jsonError("Missing repo or branch");
  }

  try {
    return c.json({ directories: await listRepoDirectories(repoFullName, branch, c.req.query("path") ?? "") });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not load directories", 503);
  }
});

app.get("/api/projects", async (c) => {
  const groups = db.select().from(projectGroups).orderBy(desc(projectGroups.updatedAt)).all();
  const serviceRows = db.select().from(services).orderBy(asc(services.name)).all();

  const grouped = await Promise.all(groups.map((group) => summarizeProject(group, serviceRows.filter((service) => service.projectId === group.id))));
  return c.json({ projects: grouped });
});

app.post("/api/projects", async (c) => {
  const body = createProjectSchema.safeParse(await c.req.json());
  if (!body.success) {
    return jsonError(body.error.issues[0]?.message ?? "Invalid project");
  }

  const timestamp = nowIso();
  const projectSlug = createUniqueSlug(body.data.name, getProjectSlugSet());
  const project: ProjectGroup = {
    id: nanoid(10),
    name: body.data.name,
    slug: projectSlug,
    description: body.data.description ?? null,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  db.insert(projectGroups).values(project).run();
  return c.json({ project: await summarizeProject(project, []) }, 201);
});

app.get("/api/projects/:projectSlug", async (c) => {
  const project = getProjectBySlug(c.req.param("projectSlug"));
  if (!project) {
    return jsonError("Project not found", 404);
  }

  return c.json({ project: await summarizeProject(project, getServicesForProject(project.id)) });
});

app.patch("/api/projects/:projectId", async (c) => {
  const project = getProjectById(c.req.param("projectId"));
  if (!project) {
    return jsonError("Project not found", 404);
  }

  const body = updateProjectSchema.safeParse(await c.req.json());
  if (!body.success) {
    return jsonError(body.error.issues[0]?.message ?? "Invalid project");
  }

  const updated = {
    ...project,
    name: body.data.name ?? project.name,
    description: body.data.description === undefined ? project.description : body.data.description ?? null,
    updatedAt: nowIso()
  };

  db.update(projectGroups)
    .set({ name: updated.name, description: updated.description, updatedAt: updated.updatedAt })
    .where(eq(projectGroups.id, project.id))
    .run();

  return c.json({ project: await summarizeProject(updated, getServicesForProject(project.id)) });
});

app.post("/api/projects/:projectId/services", async (c) => {
  const project = getProjectById(c.req.param("projectId"));
  if (!project) {
    return jsonError("Project not found", 404);
  }

  const body = createServiceSchema.safeParse(await c.req.json());
  if (!body.success) {
    return jsonError(body.error.issues[0]?.message ?? "Invalid service");
  }

  const repoFullName = body.data.repoFullName ?? null;
  const repoUrl = body.data.repoUrl ?? (repoFullName ? repoUrlFromFullName(repoFullName) : "");
  if (isDatabaseService({ repoUrl, repoFullName }) && body.data.databasePublicEnabled && !body.data.databasePublicHostname) {
    return jsonError("Public database hostname is required");
  }

  const service = createServiceRecord(project.id, body.data);
  db.update(projectGroups).set({ updatedAt: nowIso() }).where(eq(projectGroups.id, project.id)).run();
  await writeAndReloadCaddy();
  return c.json({ service: await publicService(service) }, 201);
});

function getLocalIpAddress() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "127.0.0.1";
}

let cachedPublicIp = getLocalIpAddress();
async function fetchPublicIp() {
  try {
    const res = await fetch("https://api.ipify.org");
    if (res.ok) {
      cachedPublicIp = (await res.text()).trim();
    }
  } catch {
    // Keep local network IP address
  }
}
fetchPublicIp();

async function checkDomainDns(hostname: string, targetIp: string): Promise<"active" | "pending"> {
  if (hostname.endsWith(".localhost") || hostname === "localhost" || hostname === "127.0.0.1") {
    return "active";
  }
  try {
    const addresses = await dns.resolve4(hostname);
    if (addresses.includes(targetIp) || addresses.includes("127.0.0.1")) {
      return "active";
    }
  } catch {
    // DNS lookup failed
  }
  return "pending";
}

app.get("/api/services/:serviceId/overview", async (c) => {
  const service = getServiceById(c.req.param("serviceId"));
  if (!service) {
    return jsonError("Service not found", 404);
  }
  const isDatabase = isDatabaseService(service);
  if (isDatabase) {
    syncDatabaseUrlEnvVar(service.id);
  }

  const serviceDeployments = db
    .select()
    .from(deployments)
    .where(eq(deployments.serviceId, service.id))
    .orderBy(desc(deployments.createdAt))
    .limit(30)
    .all();

  const resolvedEnv = resolveServiceEnv(service.id);

  const serviceEnv = db
    .select()
    .from(envVars)
    .where(eq(envVars.serviceId, service.id))
    .orderBy(asc(envVars.key))
    .all()
    .map((row) => ({
      id: row.id,
      key: row.key,
      hasValue: row.value.length > 0,
      value: row.value,
      resolvedValue: resolvedEnv[row.key] ?? row.value,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }));

  const serviceDomains = db
    .select()
    .from(domains)
    .where(eq(domains.serviceId, service.id))
    .orderBy(asc(domains.hostname))
    .all();

  // Dynamically check DNS configuration for each public domain in real-time
  const updatedDomains = isDatabase
    ? []
    : await Promise.all(
        serviceDomains.map(async (d) => {
          const status = await checkDomainDns(d.hostname, cachedPublicIp);
          if (status !== d.status) {
            db.update(domains).set({ status, updatedAt: nowIso() }).where(eq(domains.id, d.id)).run();
            return { ...d, status, updatedAt: nowIso() };
          }
          return d;
        })
      );

  const publicFacingService = await publicService(service);
  const normalizedDeployments =
    publicFacingService.status === "failed"
      ? serviceDeployments.map((deployment) =>
          deployment.status === "running" ? { ...deployment, status: "failed" } : deployment
        )
      : serviceDeployments;

  return c.json({
    service: publicFacingService,
    deployments: normalizedDeployments,
    env: serviceEnv,
    domains: updatedDomains,
    publicIp: cachedPublicIp
  });
});

app.get("/api/services/:serviceId/suggestion-keys", async (c) => {
  const service = getServiceById(c.req.param("serviceId"));
  if (!service) {
    return jsonError("Service not found", 404);
  }

  const groupServices = db
    .select()
    .from(services)
    .where(eq(services.projectId, service.projectId))
    .all();

  const serviceIds = groupServices.map((s) => s.id);
  const allEnvs = serviceIds.length > 0
    ? db.select().from(envVars).where(inArray(envVars.serviceId, serviceIds)).all()
    : [];

  const envsByServiceId = new Map<string, string[]>();
  for (const sId of serviceIds) {
    envsByServiceId.set(sId, []);
  }
  for (const row of allEnvs) {
    envsByServiceId.get(row.serviceId)?.push(row.key);
  }

  const suggestions: Array<{ key: string; label: string }> = [];

  const properties = ["hostPort", "activePort", "internalPort", "name", "slug", "status"];
  for (const prop of properties) {
    suggestions.push({
      key: prop,
      label: `Local service ${prop}`
    });
  }

  const localEnvs = envsByServiceId.get(service.id) || [];
  for (const key of localEnvs) {
    suggestions.push({
      key,
      label: "Local environment variable"
    });
  }

  for (const s of groupServices) {
    if (s.id === service.id) continue;
    
    for (const prop of properties) {
      suggestions.push({
        key: `${s.slug}.${prop}`,
        label: `Service ${s.name} ${prop}`
      });
    }

    const sEnvs = envsByServiceId.get(s.id) || [];
    for (const key of sEnvs) {
      suggestions.push({
        key: `${s.slug}.${key}`,
        label: `Service ${s.name} variable`
      });
    }
  }

  return c.json({ suggestions });
});

app.get("/api/services/:serviceId/database/tables", async (c) => {
  try {
    return c.json(await getDatabaseTables(c.req.param("serviceId"), Number(c.req.query("database") ?? 0)));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not load database tables", 400);
  }
});

app.get("/api/services/:serviceId/database/rows", async (c) => {
  try {
    const table = c.req.query("table") ?? "";
    if (!table) return jsonError("Table is required");

    const limit = Number(c.req.query("limit") ?? 50);
    const offset = Number(c.req.query("offset") ?? 0);
    const filters = parseDatabaseFilters(c.req.query("filters"));
    return c.json(await getDatabaseRows(c.req.param("serviceId"), table, limit, offset, filters));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not load database rows", 400);
  }
});

app.post("/api/services/:serviceId/database/query", async (c) => {
  const body = databaseQuerySchema.safeParse(await c.req.json());
  if (!body.success) {
    return jsonError(body.error.issues[0]?.message ?? "Invalid SQL query");
  }

  try {
    return c.json(await runDatabaseQuery(c.req.param("serviceId"), body.data.sql));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not run SQL query", 400);
  }
});

app.post("/api/services/:serviceId/database/rows", async (c) => {
  const body = databaseInsertSchema.safeParse(await c.req.json());
  if (!body.success) {
    return jsonError(body.error.issues[0]?.message ?? "Invalid row");
  }

  try {
    return c.json(await insertDatabaseRow(c.req.param("serviceId"), body.data.table, body.data.values), 201);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not insert database row", 400);
  }
});

app.patch("/api/services/:serviceId/database/rows", async (c) => {
  const body = databaseUpdateSchema.safeParse(await c.req.json());
  if (!body.success) {
    return jsonError(body.error.issues[0]?.message ?? "Invalid row update");
  }

  try {
    return c.json(await updateDatabaseRow(c.req.param("serviceId"), body.data.table, body.data.primaryKey, body.data.values));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not update database row", 400);
  }
});

app.delete("/api/services/:serviceId/database/rows", async (c) => {
  const body = databaseDeleteSchema.safeParse(await c.req.json());
  if (!body.success) {
    return jsonError(body.error.issues[0]?.message ?? "Invalid row delete");
  }

  try {
    return c.json(await deleteDatabaseRow(c.req.param("serviceId"), body.data.table, body.data.primaryKey));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not delete database row", 400);
  }
});

app.get("/api/services/:serviceId/database/backups", (c) => {
  try {
    return c.json({ backups: listDatabaseBackups(c.req.param("serviceId")), r2: publicR2Settings() });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not load backups", 400);
  }
});

app.post("/api/services/:serviceId/database/backups", async (c) => {
  const body = backupCreateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return jsonError(body.error.issues[0]?.message ?? "Invalid backup request");
  }

  try {
    return c.json({ backup: await createDatabaseBackup(c.req.param("serviceId"), body.data.storage) }, 201);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not create backup", 400);
  }
});

app.get("/api/services/:serviceId/database/backups/:backupId/download", (c) => {
  try {
    const { backup, localPath } = getDatabaseBackupFile(c.req.param("serviceId"), c.req.param("backupId"));
    const fileName = backup.fileName || basename(localPath);
    return new Response(readFileSync(localPath), {
      headers: {
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Type": "application/octet-stream"
      }
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not download backup", 404);
  }
});

app.delete("/api/services/:serviceId/database/backups/:backupId", async (c) => {
  try {
    return c.json(await deleteDatabaseBackup(c.req.param("serviceId"), c.req.param("backupId")));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not delete backup", 400);
  }
});

app.patch("/api/services/:serviceId", async (c) => {
  const service = getServiceById(c.req.param("serviceId"));
  if (!service) {
    return jsonError("Service not found", 404);
  }

  const body = updateServiceSchema.safeParse(await c.req.json());
  if (!body.success) {
    return jsonError(body.error.issues[0]?.message ?? "Invalid update");
  }

  const repoFullName = body.data.repoFullName === undefined ? service.repoFullName : body.data.repoFullName;
  const repoUrl =
    body.data.repoUrl === undefined
      ? repoFullName
        ? repoUrlFromFullName(repoFullName)
        : service.repoUrl
      : body.data.repoUrl ?? service.repoUrl;
  const nextIsDatabase = isDatabaseService({ repoFullName, repoUrl });
  const databasePublicEnabled = nextIsDatabase
    ? body.data.databasePublicEnabled ?? service.databasePublicEnabled
    : false;
  const databasePublicHostname = nextIsDatabase && databasePublicEnabled
    ? body.data.databasePublicHostname ?? service.databasePublicHostname
    : null;

  if (nextIsDatabase && databasePublicEnabled && !databasePublicHostname) {
    return jsonError("Public database hostname is required");
  }

  db.update(services)
    .set({
      ...body.data,
      repoFullName,
      repoUrl,
      githubToken: body.data.githubToken === undefined ? service.githubToken : body.data.githubToken ?? null,
      databasePublicEnabled,
      databasePublicHostname,
      updatedAt: nowIso()
    })
    .where(eq(services.id, service.id))
    .run();

  syncDatabaseUrlEnvVar(service.id);

  const updated = getServiceById(service.id);
  return c.json({ service: updated ? await publicService(updated) : null });
});

app.delete("/api/services/:serviceId", async (c) => {
  const service = getServiceById(c.req.param("serviceId"));
  if (!service) {
    return jsonError("Service not found", 404);
  }

  await removeServiceRuntime(service);
  db.delete(domains).where(eq(domains.serviceId, service.id)).run();
  db.delete(envVars).where(eq(envVars.serviceId, service.id)).run();

  const serviceDeployments = db.select({ id: deployments.id }).from(deployments).where(eq(deployments.serviceId, service.id)).all();
  if (serviceDeployments.length > 0) {
    db.delete(deploymentLogs).where(inArray(deploymentLogs.deploymentId, serviceDeployments.map((row) => row.id))).run();
  }
  db.delete(deployments).where(eq(deployments.serviceId, service.id)).run();
  db.delete(services).where(eq(services.id, service.id)).run();
  db.update(projectGroups).set({ updatedAt: nowIso() }).where(eq(projectGroups.id, service.projectId)).run();

  const caddy = await writeAndReloadCaddy();
  return c.json({ ok: true, caddy });
});

app.delete("/api/projects/:projectId", async (c) => {
  const project = getProjectById(c.req.param("projectId"));
  if (!project) {
    return jsonError("Project not found", 404);
  }

  const projectServices = getServicesForProject(project.id);
  for (const service of projectServices) {
    await removeServiceRuntime(service);
    db.delete(domains).where(eq(domains.serviceId, service.id)).run();
    db.delete(envVars).where(eq(envVars.serviceId, service.id)).run();
    const serviceDeployments = db.select({ id: deployments.id }).from(deployments).where(eq(deployments.serviceId, service.id)).all();
    if (serviceDeployments.length > 0) {
      db.delete(deploymentLogs).where(inArray(deploymentLogs.deploymentId, serviceDeployments.map((row) => row.id))).run();
    }
    db.delete(deployments).where(eq(deployments.serviceId, service.id)).run();
    db.delete(services).where(eq(services.id, service.id)).run();
  }

  db.delete(projectGroups).where(eq(projectGroups.id, project.id)).run();
  const caddy = await writeAndReloadCaddy();
  return c.json({ ok: true, caddy });
});

app.post("/api/services/:serviceId/deployments", (c) => {
  try {
    const service = getServiceById(c.req.param("serviceId"));
    if (!service) {
      return jsonError("Service not found", 404);
    }

    syncProjectDatabaseConnectionEnv(service.projectId);
    const deployment = enqueueDeployment(service.id, { trigger: "manual" });
    return c.json({ deployment }, 201);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not create deployment", 404);
  }
});

app.post("/api/deployments/:deploymentId/abort", (c) => {
  try {
    const result = abortDeployment(c.req.param("deploymentId"));
    return c.json(result, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not abort deployment";
    return jsonError(message, message === "Deployment not found" ? 404 : 409);
  }
});

app.get("/api/services/:serviceId/deployments", (c) => {
  const rows = db
    .select()
    .from(deployments)
    .where(eq(deployments.serviceId, c.req.param("serviceId")))
    .orderBy(desc(deployments.createdAt))
    .limit(30)
    .all();
  return c.json({ deployments: rows });
});

app.get("/api/deployments/:deploymentId/logs", (c) => {
  const rows = db
    .select()
    .from(deploymentLogs)
    .where(eq(deploymentLogs.deploymentId, c.req.param("deploymentId")))
    .orderBy(asc(deploymentLogs.id))
    .all();
  return c.json({ logs: rows });
});

app.get("/api/deployments/:deploymentId/stream", (c) => {
  const deploymentId = c.req.param("deploymentId");
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        const write = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        const existing = db
          .select()
          .from(deploymentLogs)
          .where(eq(deploymentLogs.deploymentId, deploymentId))
          .orderBy(asc(deploymentLogs.id))
          .all();
        write("snapshot", existing);

        const unsubscribe = subscribeToDeploymentLogs(deploymentId, (log) => write("log", log));
        const ping = setInterval(() => write("ping", { t: Date.now() }), 15000);

        c.req.raw.signal.addEventListener("abort", () => {
          clearInterval(ping);
          unsubscribe();
          controller.close();
        });
      }
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      }
    }
  );
});

app.get("/api/services/:serviceId/runtime-logs/stream", async (c) => {
  const service = getServiceById(c.req.param("serviceId"));
  if (!service) {
    return jsonError("Service not found", 404);
  }

  const containerName = containerNameForService(service.id);
  const snapshot = await readContainerLogs(containerName);
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        let closed = false;
        const write = (event: string, data: unknown) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          } catch {
            closed = true;
          }
        };

        write("snapshot", snapshot);

        let nextId = snapshot.at(-1)?.id ?? 0;
        const child = spawn("docker", ["logs", "-f", "--tail", "0", "--timestamps", containerName], {
          stdio: ["ignore", "pipe", "pipe"]
        });

        const consume = (stream: "stdout" | "stderr") => (chunk: Buffer) => {
          const lines = chunk
            .toString()
            .split(/\r?\n/)
            .map((line) => line.trimEnd())
            .filter(Boolean);

          for (const line of lines) {
            nextId += 1;
            write("log", parseRuntimeLog(line, stream, nextId));
          }
        };

        child.stdout.on("data", consume("stdout"));
        child.stderr.on("data", consume("stderr"));
        child.on("error", (error) => write("status", { ok: false, detail: error.message }));
        child.on("close", () => write("status", { ok: true, closed: true }));

        const ping = setInterval(() => write("ping", { t: Date.now() }), 15000);

        c.req.raw.signal.addEventListener("abort", () => {
          if (closed) return;
          closed = true;
          clearInterval(ping);
          child.kill("SIGTERM");
          try {
            controller.close();
          } catch {
            // Already closed.
          }
        });
      }
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      }
    }
  );
});

app.post("/api/services/:serviceId/env", async (c) => {
  const service = getServiceById(c.req.param("serviceId"));
  if (!service) {
    return jsonError("Service not found", 404);
  }

  const body = envSchema.safeParse(await c.req.json());
  if (!body.success) {
    return jsonError(body.error.issues[0]?.message ?? "Invalid env var");
  }

  const timestamp = nowIso();
  const normalizedValue = normalizeEnvValue(body.data.value);
  db.insert(envVars)
    .values({ id: nanoid(10), serviceId: service.id, key: body.data.key, value: normalizedValue, createdAt: timestamp, updatedAt: timestamp })
    .onConflictDoUpdate({
      target: [envVars.serviceId, envVars.key],
      set: { value: normalizedValue, updatedAt: timestamp }
    })
    .run();

  syncDatabaseUrlEnvVar(service.id);

  return c.json({ ok: true }, 201);
});

app.delete("/api/services/:serviceId/env/:envId", (c) => {
  db.delete(envVars).where(eq(envVars.id, c.req.param("envId"))).run();
  syncDatabaseUrlEnvVar(c.req.param("serviceId"));
  return c.json({ ok: true });
});

app.post("/api/services/:serviceId/domains", async (c) => {
  const service = getServiceById(c.req.param("serviceId"));
  if (!service) {
    return jsonError("Service not found", 404);
  }

  const body = domainSchema.safeParse(await c.req.json());
  if (!body.success) {
    return jsonError(body.error.issues[0]?.message ?? "Invalid domain");
  }

  const timestamp = nowIso();
  const isLocal = body.data.hostname.endsWith(".localhost") || body.data.hostname === "localhost" || body.data.hostname === "127.0.0.1";
  const initialStatus = isLocal ? "active" : "pending";

  db.insert(domains)
    .values({ id: nanoid(10), serviceId: service.id, hostname: body.data.hostname, status: initialStatus, createdAt: timestamp, updatedAt: timestamp })
    .run();

  const caddy = await writeAndReloadCaddy();
  return c.json({ ok: true, caddy }, 201);
});

app.delete("/api/services/:serviceId/domains/:domainId", async (c) => {
  db.delete(domains).where(eq(domains.id, c.req.param("domainId"))).run();
  const caddy = await writeAndReloadCaddy();
  return c.json({ ok: true, caddy });
});

app.patch("/api/services/:serviceId/domains/:domainId", async (c) => {
  const service = getServiceById(c.req.param("serviceId"));
  if (!service) {
    return jsonError("Service not found", 404);
  }

  const body = domainSchema.safeParse(await c.req.json());
  if (!body.success) {
    return jsonError(body.error.issues[0]?.message ?? "Invalid domain");
  }

  const hostname = body.data.hostname.trim().toLowerCase();
  const isLocal = hostname.endsWith(".localhost") || hostname === "localhost" || hostname === "127.0.0.1";
  const status = isLocal ? "active" : "pending";

  db.update(domains)
    .set({ hostname, status, updatedAt: nowIso() })
    .where(eq(domains.id, c.req.param("domainId")))
    .run();

  const caddy = await writeAndReloadCaddy();
  return c.json({ ok: true, caddy });
});

app.post("/api/github/app/webhook", async (c) => {
  if (!config.githubWebhookSecret) {
    return jsonError("GitHub webhook secret is not configured", 503);
  }
  const rawBody = await c.req.text();
  if (!verifyGitHubSignature(rawBody, c.req.header("x-hub-signature-256"), config.githubWebhookSecret)) {
    return jsonError("Invalid webhook signature", 401);
  }

  const event = c.req.header("x-github-event");
  if (event === "ping") {
    return c.json({ ok: true, event: "ping" });
  }

  if (event !== "push") {
    return c.json({ ok: true, ignored: event });
  }

  const payload = JSON.parse(rawBody) as {
    after?: string;
    ref?: string;
    repository?: {
      full_name?: string;
    };
  };
  const branch = branchFromGitRef(payload.ref);
  const repoFullName = payload.repository?.full_name;
  if (!branch || !repoFullName) {
    return c.json({ ok: true, ignored: "missing ref or repository" });
  }

  const matchingServices = db
    .select()
    .from(services)
    .where(and(eq(services.repoFullName, repoFullName), eq(services.branch, branch)))
    .all();

  if (matchingServices.length === 0) {
    return c.json({ ok: true, ignored: `${repoFullName}@${branch}` });
  }

  for (const projectId of new Set(matchingServices.map((service) => service.projectId))) {
    syncProjectDatabaseConnectionEnv(projectId);
  }

  const queued = matchingServices.map((service) => enqueueDeployment(service.id, { trigger: "github", commitSha: payload.after }));
  return c.json({ ok: true, queued: queued.map((deployment) => deployment.id) });
});

app.post("/api/integrations/railway/projects", async (c) => {
  try {
    const body = await c.req.json();
    const token = body?.apiToken;
    if (!token) {
      return jsonError("API Token is required");
    }
    const projects = await getRailwayProjects(token);
    return c.json({ projects });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to load Railway projects";
    return jsonError(msg);
  }
});

app.post("/api/integrations/railway/project-details", async (c) => {
  try {
    const body = await c.req.json();
    const token = body?.apiToken;
    const projectId = body?.projectId;
    if (!token || !projectId) {
      return jsonError("API Token and Project ID are required");
    }
    const details = await getRailwayProjectDetails(token, projectId);
    return c.json({ details });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to load Railway project details";
    return jsonError(msg);
  }
});

app.post("/api/integrations/railway/import", async (c) => {
  try {
    const body = await c.req.json();
    const token = body?.apiToken;
    const projectId = body?.projectId;
    const config = body?.config || {};
    if (!token || !projectId) {
      return jsonError("API Token and Project ID are required");
    }
    const result = await importRailwayProject(token, projectId, config);
    return c.json({ ok: true, projectSlug: result.projectSlug });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to import Railway project";
    return jsonError(msg);
  }
});

app.get("/api/search", (c) => {
  const result = searchSchema.safeParse(c.req.query());
  return c.json(result.success ? result.data : {});
});

if (process.env.NODE_ENV === "production") {
  app.use("*", serveStatic({ root: "./dist/client" }));
  app.get("*", serveStatic({ path: "./dist/client/index.html" }));
}

syncAllExistingDatabaseUrls();
void writeAndReloadCaddy().catch((error) => {
  console.error("Failed to write Caddy config on startup:", error);
});
startDeployWorker();

serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`Aeroplane control plane listening on http://${info.address}:${info.port}`);
});

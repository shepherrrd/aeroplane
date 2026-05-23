import { and, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ChildProcess, spawn } from "node:child_process";
import net from "node:net";
import { config } from "./config.js";
import { db, nowIso, sqlite } from "./db.js";
import { publishDeploymentLog } from "./logBus.js";
import { deploymentLogs, deployments, envVars, services, type Deployment, type Service } from "./schema.js";
import { writeAndReloadCaddy } from "./caddy.js";
import { getCloneTokenForRepo } from "./github-connect.js";

type RunOptions = {
  cwd?: string;
  env?: Record<string, string>;
  redact?: string[];
};

type EnqueueOptions = {
  commitSha?: string;
  trigger: "manual" | "github";
};

let workerActive = false;
let workerStarted = false;
const activeCommands = new Map<string, ChildProcess>();
const abortRequests = new Set<string>();

class DeploymentAbortedError extends Error {
  constructor() {
    super("Deployment aborted");
  }
}

function now() {
  return nowIso();
}

function safeSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "app";
}

function safeDockerIdentifier(value: string, fallback: string) {
  return value.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "") || fallback;
}

export function containerNameForService(serviceId: string) {
  return `deploy-${safeDockerIdentifier(serviceId, "service")}`;
}

export function staticSiteDirForService(serviceId: string) {
  return resolve(config.dataDir, "static-sites", serviceId);
}

function redactLine(line: string, secrets: string[]) {
  let redacted = line;
  for (const secret of secrets) {
    if (secret.length >= 4) {
      redacted = redacted.split(secret).join("[redacted]");
    }
  }
  return redacted;
}

function appendDeploymentLog(deploymentId: string, line: string, stream = "system", secrets: string[] = []) {
  const cleanLine = redactLine(line, secrets);
  const createdAt = now();
  const result = db
    .insert(deploymentLogs)
    .values({ deploymentId, line: cleanLine, stream, createdAt })
    .run();
  const log = {
    id: Number(result.lastInsertRowid),
    deploymentId,
    line: cleanLine,
    stream,
    createdAt
  };
  publishDeploymentLog(log);
  return log;
}

function runCommand(command: string, args: string[], deploymentId: string, options: RunOptions = {}) {
  const redactions = options.redact ?? [];
  appendDeploymentLog(deploymentId, `$ ${[command, ...args].map((part) => redactLine(part, redactions)).join(" ")}`);

  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    activeCommands.set(deploymentId, child);

    const handleChunk = (stream: "stdout" | "stderr") => (chunk: Buffer) => {
      const lines = chunk.toString().split(/\r?\n/);
      for (const line of lines) {
        if (line.trim().length > 0) {
          appendDeploymentLog(deploymentId, line, stream, redactions);
        }
      }
    };

    child.stdout.on("data", handleChunk("stdout"));
    child.stderr.on("data", handleChunk("stderr"));
    child.on("error", (error) => {
      activeCommands.delete(deploymentId);
      if (abortRequests.has(deploymentId)) {
        reject(new DeploymentAbortedError());
        return;
      }
      reject(error);
    });
    child.on("close", (code) => {
      activeCommands.delete(deploymentId);
      if (abortRequests.has(deploymentId)) {
        reject(new DeploymentAbortedError());
        return;
      }
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`${command} exited with ${code}`));
      }
    });
  });
}

function cloneUrlWithToken(repoUrl: string, token?: string | null) {
  if (!token || !repoUrl.startsWith("https://github.com/")) {
    return repoUrl;
  }

  const url = new URL(repoUrl);
  url.username = "x-access-token";
  url.password = token;
  return url.toString();
}

function parseTcpTarget(address: string) {
  const match = address.match(/^tcp:\/\/([^:/]+):(\d+)$/i);
  if (!match) return null;
  return { host: match[1], port: Number(match[2]) };
}

function isBuildkitReachable(address: string, timeoutMs = 600) {
  const target = parseTcpTarget(address);
  if (!target) {
    return Promise.resolve(false);
  }

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
    socket.connect(target.port, target.host);
  });
}

function buildkitStartHint() {
  return "docker run --rm --privileged -d --name deploy-buildkit -p 127.0.0.1:1234:1234 moby/buildkit:latest --addr tcp://0.0.0.0:1234";
}

async function ensureBuildkitAvailable(deploymentId: string) {
  const reachable = await isBuildkitReachable(config.buildkitHost);
  if (reachable) return;

  appendDeploymentLog(deploymentId, `BuildKit is unavailable at ${config.buildkitHost}.`, "stderr");
  appendDeploymentLog(deploymentId, `Start it with: ${buildkitStartHint()}`, "stderr");
  throw new Error(`BuildKit is unavailable at ${config.buildkitHost}`);
}

function escapeDockerEnvValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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

function createCustomDockerfile({
  installCommand,
  buildCommand,
  startCommand,
  internalPort,
  looksLikeBunProject,
  buildEnvKeys
}: {
  installCommand: string;
  buildCommand: string;
  startCommand: string;
  internalPort: number;
  looksLikeBunProject: boolean;
  buildEnvKeys: string[];
}) {
  const baseImage = looksLikeBunProject ? "oven/bun:1" : "node:22";
  const lines = [
    `FROM ${baseImage} AS build`,
    "WORKDIR /app",
    "COPY . /app"
  ];

  for (const key of buildEnvKeys) {
    lines.push(`ARG ${key}`);
    lines.push(`ENV ${key}=$${key}`);
  }

  if (installCommand) lines.push(`RUN ${installCommand}`);
  if (buildCommand) lines.push(`RUN ${buildCommand}`);

  lines.push(`FROM ${baseImage}`);
  lines.push("WORKDIR /app");
  lines.push(`ENV PORT=\"${escapeDockerEnvValue(String(internalPort))}\"`);
  lines.push("COPY --from=build /app /app");
  lines.push(`CMD ${JSON.stringify(["sh", "-lc", startCommand])}`);

  return `${lines.join("\n")}\n`;
}

function packageManagerFromPackageJson(sourceDir: string) {
  const packageJsonPath = join(sourceDir, "package.json");
  if (!existsSync(packageJsonPath)) return null;

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { packageManager?: string };
    const packageManager = packageJson.packageManager?.split("@")[0];
    if (packageManager === "bun" || packageManager === "pnpm" || packageManager === "yarn" || packageManager === "npm") {
      return packageManager;
    }
  } catch {
    return null;
  }

  return null;
}

function detectPackageManager(sourceDir: string, commands: string[]) {
  if (commands.some((command) => /\bbun\b/.test(command)) || existsSync(join(sourceDir, "bun.lock")) || existsSync(join(sourceDir, "bun.lockb"))) {
    return "bun";
  }

  const packageManager = packageManagerFromPackageJson(sourceDir);
  if (packageManager) return packageManager;

  if (existsSync(join(sourceDir, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(sourceDir, "yarn.lock"))) return "yarn";
  return "npm";
}

function defaultInstallCommand(sourceDir: string, packageManager: string) {
  if (!existsSync(join(sourceDir, "package.json"))) return "";

  if (packageManager === "bun") return "bun install --frozen-lockfile";
  if (packageManager === "pnpm") return "corepack enable && pnpm install --frozen-lockfile";
  if (packageManager === "yarn") return "corepack enable && yarn install --immutable";
  if (existsSync(join(sourceDir, "package-lock.json")) || existsSync(join(sourceDir, "npm-shrinkwrap.json"))) return "npm ci";
  return "npm install";
}

function getEnvForService(serviceId: string) {
  const rows = db.select().from(envVars).where(eq(envVars.serviceId, serviceId)).all();
  return Object.fromEntries(rows.map((row) => [row.key, normalizeEnvValue(row.value)]));
}

function getLastLiveServiceStatus(serviceId: string): "active" | "idle" {
  const latestRunning = db
    .select({ id: deployments.id })
    .from(deployments)
    .where(and(eq(deployments.serviceId, serviceId), eq(deployments.status, "running")))
    .orderBy(desc(deployments.createdAt))
    .limit(1)
    .get();

  return latestRunning ? "active" : "idle";
}

export function abortDeployment(deploymentId: string) {
  const deployment = db.select().from(deployments).where(eq(deployments.id, deploymentId)).get();
  if (!deployment) {
    throw new Error("Deployment not found");
  }

  if (deployment.status === "queued") {
    db.update(deployments).set({ status: "aborted", finishedAt: now() }).where(eq(deployments.id, deploymentId)).run();
    db.update(services)
      .set({ status: getLastLiveServiceStatus(deployment.serviceId), updatedAt: now() })
      .where(eq(services.id, deployment.serviceId))
      .run();
    appendDeploymentLog(deploymentId, "Deployment aborted before start.", "stderr");
    return { accepted: true };
  }

  if (deployment.status !== "building") {
    throw new Error("Only queued or building deployments can be aborted");
  }

  abortRequests.add(deploymentId);
  db.update(deployments).set({ status: "aborted", finishedAt: now() }).where(eq(deployments.id, deploymentId)).run();
  appendDeploymentLog(deploymentId, "Abort requested. Stopping build…", "stderr");

  const child = activeCommands.get(deploymentId);
  if (child && !child.killed) {
    child.kill("SIGTERM");
    setTimeout(() => {
      const stillRunning = activeCommands.get(deploymentId);
      if (stillRunning && !stillRunning.killed) {
        stillRunning.kill("SIGKILL");
      }
    }, 3000);
  }

  return { accepted: true };
}

function supersedeRunningDeployments(serviceId: string) {
  db.update(deployments)
    .set({ status: "superseded" })
    .where(and(eq(deployments.serviceId, serviceId), eq(deployments.status, "running")))
    .run();
}

function normalizeRunningDeployments() {
  const runningDeployments = db
    .select({ id: deployments.id, serviceId: deployments.serviceId })
    .from(deployments)
    .where(eq(deployments.status, "running"))
    .orderBy(desc(deployments.createdAt))
    .all();
  const latestByService = new Set<string>();

  for (const deployment of runningDeployments) {
    if (!latestByService.has(deployment.serviceId)) {
      latestByService.add(deployment.serviceId);
      continue;
    }

    db.update(deployments).set({ status: "superseded" }).where(eq(deployments.id, deployment.id)).run();
  }
}

export function getServiceById(serviceId: string) {
  return db.select().from(services).where(eq(services.id, serviceId)).get();
}

export function allocateHostPort() {
  const used = new Set(db.select({ hostPort: services.hostPort }).from(services).all().map((row) => row.hostPort));
  for (let port = config.hostPortStart; port <= config.hostPortEnd; port += 1) {
    if (!used.has(port)) {
      return port;
    }
  }
  throw new Error("No host ports are available in the configured deployment range.");
}

export async function removeServiceRuntime(service: Service) {
  const containerName = containerNameForService(service.id);
  rmSync(staticSiteDirForService(service.id), { recursive: true, force: true });
  return new Promise<void>((resolvePromise) => {
    const child = spawn("docker", ["rm", "-f", containerName], {
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.on("error", () => resolvePromise());
    child.on("close", () => resolvePromise());
  });
}

function normalizedStaticOutputPath(staticOutput: string) {
  return staticOutput.replace(/^\.?\/*/, "").replace(/\/+$/g, "");
}

function staticOutputPathInImage(service: Service, hasCustomCommands: boolean) {
  const normalized = normalizedStaticOutputPath(service.staticOutput ?? "");
  if (!normalized) return null;
  if (hasCustomCommands && service.rootDir) {
    return `/app/${service.rootDir.replace(/^\/+|\/+$/g, "")}/${normalized}`;
  }
  return `/app/${normalized}`;
}

async function exportStaticSiteFromImage(deployment: Deployment, service: Service, imageTag: string, hasCustomCommands: boolean) {
  const imagePath = staticOutputPathInImage(service, hasCustomCommands);
  if (!imagePath) {
    throw new Error("Static output path is not configured");
  }

  const staticDir = staticSiteDirForService(service.id);
  const exportContainer = `deploy-export-${safeDockerIdentifier(deployment.id, "export")}`;
  rmSync(staticDir, { recursive: true, force: true });
  mkdirSync(staticDir, { recursive: true });

  appendDeploymentLog(deployment.id, `Exporting static output from ${imagePath}.`);
  await runCommand("docker", ["create", "--name", exportContainer, imageTag], deployment.id);
  try {
    await runCommand("docker", ["cp", `${exportContainer}:${imagePath}/.`, staticDir], deployment.id);
  } finally {
    await runCommand("docker", ["rm", "-f", exportContainer], deployment.id).catch(() => {
      appendDeploymentLog(deployment.id, `No export container named ${exportContainer} was left behind.`);
    });
  }

  if (!existsSync(staticDir)) {
    throw new Error(`Static output directory ${imagePath} could not be exported`);
  }

  if (!existsSync(join(staticDir, "index.html"))) {
    for (const nestedDir of ["client", "browser", "public"]) {
      const candidateDir = join(staticDir, nestedDir);
      if (!existsSync(join(candidateDir, "index.html"))) continue;

      for (const entry of readdirSync(candidateDir)) {
        cpSync(join(candidateDir, entry), join(staticDir, entry), { recursive: true });
      }
      rmSync(candidateDir, { recursive: true, force: true });
      break;
    }
  }

  if (!existsSync(join(staticDir, "index.html"))) {
    throw new Error(`Static output ${imagePath} does not contain index.html. This looks like a server-rendered build, not a static site.`);
  }
}

export function enqueueDeployment(serviceId: string, options: EnqueueOptions) {
  const service = getServiceById(serviceId);
  if (!service) {
    throw new Error("Service not found");
  }

  const createdAt = now();
  const deployment: Deployment = {
    id: nanoid(12),
    serviceId,
    commitSha: options.commitSha ?? null,
    status: "queued",
    trigger: options.trigger,
    imageTag: null,
    containerName: null,
    startedAt: null,
    finishedAt: null,
    createdAt
  };

  db.insert(deployments).values(deployment).run();
  appendDeploymentLog(deployment.id, `Deployment queued from ${options.trigger}.`);
  return deployment;
}

async function runDeployment(deployment: Deployment, service: Service) {
  const startedAt = now();
  const isDatabase = service.repoUrl === "database" || (service.repoFullName?.startsWith("database:") ?? false);
  const containerName = containerNameForService(service.id);
  const env = getEnvForService(service.id);
  const secrets = [...Object.values(env)].filter(Boolean);

  if (isDatabase) {
    const dbType = service.repoFullName?.split(":")[1] || "postgres";
    const officialImage =
      dbType === "postgres"
        ? "postgres:15-alpine"
        : dbType === "mysql"
          ? "mysql:8"
          : dbType === "redis"
            ? "redis:7-alpine"
            : dbType === "mongodb"
              ? "mongo:6"
              : dbType === "clickhouse"
                ? "clickhouse/clickhouse-server:latest"
                : "postgres:15-alpine";

    db.update(deployments)
      .set({ status: "building", startedAt, imageTag: officialImage, containerName })
      .where(eq(deployments.id, deployment.id))
      .run();
    db.update(services).set({ status: "building", updatedAt: now() }).where(eq(services.id, service.id)).run();

    appendDeploymentLog(deployment.id, `Provisioning database service ${service.name} (${dbType})...`);

    try {
      appendDeploymentLog(deployment.id, `Pulling official image: ${officialImage}`);
      await runCommand("docker", ["pull", officialImage], deployment.id);

      await runCommand("docker", ["rm", "-f", containerName], deployment.id).catch(() => {
        appendDeploymentLog(deployment.id, `No previous container named ${containerName} was running.`);
      });

      const dockerArgs = ["run", "-d", "--restart", "unless-stopped", "--name", containerName, "-p", `127.0.0.1:${service.hostPort}:${service.internalPort}`];
      if (dbType === "clickhouse") {
        dockerArgs.push("--ulimit", "nofile=262144:262144");
      }
      for (const [key, value] of Object.entries(env)) {
        dockerArgs.push("--env", `${key}=${value}`);
      }
      dockerArgs.push(officialImage);

      appendDeploymentLog(deployment.id, `Running container mapping host port ${service.hostPort} to internal port ${service.internalPort}...`);
      await runCommand("docker", dockerArgs, deployment.id, { redact: secrets });

      const deployedAt = now();
      supersedeRunningDeployments(service.id);
      db.update(deployments).set({ status: "running", finishedAt: deployedAt }).where(eq(deployments.id, deployment.id)).run();
      db.update(services)
        .set({ status: "active", lastDeployedAt: deployedAt, updatedAt: deployedAt })
        .where(eq(services.id, service.id))
        .run();
      appendDeploymentLog(deployment.id, `Database successfully provisioned and listening on 127.0.0.1:${service.hostPort}!`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown database deployment error";
      appendDeploymentLog(deployment.id, `Database provisioning failed: ${message}`, "stderr", secrets);
      db.update(deployments).set({ status: "failed", finishedAt: now() }).where(eq(deployments.id, deployment.id)).run();
      db.update(services).set({ status: "failed", updatedAt: now() }).where(eq(services.id, service.id)).run();
    }
    return;
  }

  const imageRepository = `deploy-${safeSlug(service.name)}-${safeDockerIdentifier(service.id, "service")}`;
  const imageVersion = safeDockerIdentifier(deployment.id, "latest");
  const imageTag = `${imageRepository}:${imageVersion}`;
  const buildRoot = resolve(config.dataDir, "builds", deployment.id);
  const sourceDir = join(buildRoot, "source");
  const appDir = service.rootDir ? join(sourceDir, service.rootDir) : sourceDir;

  rmSync(buildRoot, { recursive: true, force: true });
  mkdirSync(buildRoot, { recursive: true });

  db.update(deployments)
    .set({ status: "building", startedAt, imageTag, containerName })
    .where(eq(deployments.id, deployment.id))
    .run();
  db.update(services).set({ status: "building", updatedAt: now() }).where(eq(services.id, service.id)).run();

  appendDeploymentLog(deployment.id, `Preparing workspace for ${service.name}.`);

  try {
    if (config.deployDryRun) {
      appendDeploymentLog(deployment.id, "Dry-run mode is enabled. Skipping clone, Railpack build, and Docker run.");
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 800));
      const deployedAt = now();
      supersedeRunningDeployments(service.id);
      db.update(deployments)
        .set({ status: "running", finishedAt: deployedAt, imageTag, containerName })
        .where(eq(deployments.id, deployment.id))
        .run();
      db.update(services)
        .set({ status: "active", lastDeployedAt: deployedAt, updatedAt: deployedAt })
        .where(eq(services.id, service.id))
        .run();
      appendDeploymentLog(deployment.id, `Dry-run deployment marked running on port ${service.hostPort}.`);
      return;
    }

    const authToken = service.repoFullName ? await getCloneTokenForRepo(service.repoFullName) : service.githubToken ?? config.githubAccessToken;
    if (authToken) {
      secrets.push(authToken);
    }
    const cloneUrl = cloneUrlWithToken(service.repoUrl, authToken);
    await runCommand("git", ["clone", "--depth", "1", "--branch", service.branch, cloneUrl, sourceDir], deployment.id, {
      redact: secrets
    });

    if (deployment.commitSha) {
      await runCommand("git", ["checkout", deployment.commitSha], deployment.id, { cwd: sourceDir });
    }

    const savedInstallCommand = service.installCommand ?? "";
    const buildCommand = service.buildCommand ?? "";
    const startCommand = service.startCommand ?? "";
    const packageManager = detectPackageManager(sourceDir, [savedInstallCommand, buildCommand, startCommand]);
    const installCommand = savedInstallCommand || (buildCommand ? defaultInstallCommand(sourceDir, packageManager) : "");
    const hasCustomCommands = Boolean(installCommand || buildCommand || startCommand);
    const looksLikeBunProject = packageManager === "bun";
    const customDockerfilePath = join(buildRoot, "Dockerfile.custom");
    const isStaticService = Boolean(service.staticOutput?.trim());

    const railpackEnv: Record<string, string> = {
      ...env,
      BUILDKIT_HOST: config.buildkitHost,
      PORT: String(service.internalPort),
      // Railpack/Railway docs currently reference mixed naming for these overrides.
      // Pass both variants so saved service commands actually win over auto-detection.
      RAILPACK_START_CMD: startCommand,
      RAILPACK_START_COMMAND: startCommand,
      RAILPACK_BUILD_CMD: buildCommand,
      RAILPACK_BUILD_COMMAND: buildCommand,
      RAILPACK_INSTALL_CMD: installCommand,
      RAILPACK_INSTALL_COMMAND: installCommand,
      RAILPACK_PACKAGES: looksLikeBunProject ? "bun@latest" : "",
      FORCE_COLOR: "1"
    };

    Object.keys(railpackEnv).forEach((key) => {
      if (!railpackEnv[key]) {
        delete railpackEnv[key];
      }
    });

    if (savedInstallCommand) {
      appendDeploymentLog(deployment.id, `Using custom install command: ${installCommand}`, "system", secrets);
    } else if (installCommand) {
      appendDeploymentLog(deployment.id, `Using auto install command: ${installCommand}`, "system", secrets);
    }
    if (buildCommand) {
      appendDeploymentLog(deployment.id, `Using custom build command: ${buildCommand}`, "system", secrets);
    }
    if (startCommand) {
      appendDeploymentLog(deployment.id, `Using custom start command: ${startCommand}`, "system", secrets);
    }

    if (hasCustomCommands) {
      const dockerfile = createCustomDockerfile({
        installCommand,
        buildCommand,
        startCommand: startCommand || "node server.js",
        internalPort: service.internalPort,
        looksLikeBunProject,
        buildEnvKeys: Object.keys(env)
      });
      writeFileSync(customDockerfilePath, dockerfile);
      appendDeploymentLog(deployment.id, `Using generated Dockerfile for custom commands (${looksLikeBunProject ? "bun" : "node"}).`);
      const dockerBuildArgs = ["build", "-t", imageTag, "-f", customDockerfilePath];
      for (const [key, value] of Object.entries(env)) {
        dockerBuildArgs.push("--build-arg", `${key}=${value}`);
      }
      dockerBuildArgs.push(sourceDir);
      await runCommand("docker", dockerBuildArgs, deployment.id, { redact: secrets });
    } else {
      await ensureBuildkitAvailable(deployment.id);
      await runCommand(
        "railpack",
        ["build", "--name", imageTag, "--progress", "plain", "--cache-key", service.id, appDir],
        deployment.id,
        { env: railpackEnv, redact: secrets }
      );
    }

    await runCommand("docker", ["rm", "-f", containerName], deployment.id).catch(() => {
      appendDeploymentLog(deployment.id, `No previous container named ${containerName} was running.`);
    });

    if (isStaticService) {
      await exportStaticSiteFromImage(deployment, service, imageTag, hasCustomCommands);

      const deployedAt = now();
      supersedeRunningDeployments(service.id);
      db.update(deployments).set({ status: "running", finishedAt: deployedAt }).where(eq(deployments.id, deployment.id)).run();
      db.update(services)
        .set({ status: "active", lastDeployedAt: deployedAt, updatedAt: deployedAt })
        .where(eq(services.id, service.id))
        .run();

      const caddy = await writeAndReloadCaddy();
      appendDeploymentLog(deployment.id, caddy.ok ? "Caddy config reloaded." : `Caddy reload skipped/failed: ${caddy.detail}`);
      appendDeploymentLog(deployment.id, `Static site is served on 127.0.0.1:${service.hostPort}.`);
      return;
    }

    const dockerArgs = ["run", "-d", "--restart", "unless-stopped", "--name", containerName, "-p", `127.0.0.1:${service.hostPort}:${service.internalPort}`];
    for (const [key, value] of Object.entries({ ...env, PORT: String(service.internalPort) })) {
      dockerArgs.push("--env", `${key}=${value}`);
    }
    dockerArgs.push(imageTag);

    await runCommand("docker", dockerArgs, deployment.id, { redact: secrets });

    const deployedAt = now();
    supersedeRunningDeployments(service.id);
    db.update(deployments).set({ status: "running", finishedAt: deployedAt }).where(eq(deployments.id, deployment.id)).run();
    db.update(services)
      .set({ status: "active", lastDeployedAt: deployedAt, updatedAt: deployedAt })
      .where(eq(services.id, service.id))
      .run();

    const caddy = await writeAndReloadCaddy();
    appendDeploymentLog(deployment.id, caddy.ok ? "Caddy config reloaded." : `Caddy reload skipped/failed: ${caddy.detail}`);
    appendDeploymentLog(deployment.id, `Deployment is running on 127.0.0.1:${service.hostPort}.`);
  } catch (error) {
    if (error instanceof DeploymentAbortedError) {
      abortRequests.delete(deployment.id);
      db.update(deployments).set({ status: "aborted", finishedAt: now() }).where(eq(deployments.id, deployment.id)).run();
      db.update(services)
        .set({ status: getLastLiveServiceStatus(service.id), updatedAt: now() })
        .where(eq(services.id, service.id))
        .run();
      appendDeploymentLog(deployment.id, "Deployment aborted.", "stderr", secrets);
      return;
    }

    const message = error instanceof Error ? error.message : "Unknown deployment error";
    appendDeploymentLog(deployment.id, `Deployment failed: ${message}`, "stderr", secrets);
    db.update(deployments).set({ status: "failed", finishedAt: now() }).where(eq(deployments.id, deployment.id)).run();
    db.update(services).set({ status: "failed", updatedAt: now() }).where(eq(services.id, service.id)).run();
  } finally {
    abortRequests.delete(deployment.id);
  }
}

async function tickWorker() {
  if (workerActive) {
    return;
  }

  const queued = db
    .select()
    .from(deployments)
    .where(inArray(deployments.status, ["queued"]))
    .orderBy(desc(deployments.createdAt))
    .limit(1)
    .get();

  if (!queued) {
    return;
  }

  const service = getServiceById(queued.serviceId);
  if (!service) {
    db.update(deployments).set({ status: "failed", finishedAt: now() }).where(eq(deployments.id, queued.id)).run();
    appendDeploymentLog(queued.id, "Deployment failed: service no longer exists.", "stderr");
    return;
  }

  workerActive = true;
  try {
    await runDeployment(queued, service);
  } finally {
    workerActive = false;
  }
}

export function startDeployWorker() {
  if (workerStarted) {
    return;
  }

  workerStarted = true;
  normalizeRunningDeployments();
  sqlite
    .prepare("UPDATE deployments SET status = 'failed', finished_at = ? WHERE status IN ('building')")
    .run(now());
  setInterval(() => {
    void tickWorker();
  }, 2000);
  void tickWorker();
}

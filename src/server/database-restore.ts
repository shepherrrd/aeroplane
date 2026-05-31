import { spawn } from "node:child_process";
import { basename } from "node:path";
import { config } from "./config.js";
import { databaseTypeForService, isDatabaseService } from "./database-urls.js";
import { containerNameForService, getServiceById } from "./deploy.js";
import { db } from "./db.js";
import { runDockerExec } from "./database-viewer-shared.js";
import { envVars, type Service } from "./schema.js";
import { eq } from "drizzle-orm";

export type MigrationDatabaseDump = {
  serviceId: string;
  engine: string;
  format: string;
  path: string;
  sizeBytes: number;
  checksum: string;
};

function databaseImage(dbType: string) {
  if (dbType === "postgres") return "postgres:17-alpine";
  if (dbType === "mysql") return "mysql:8";
  if (dbType === "redis") return "redis:7-alpine";
  if (dbType === "mongodb" || dbType === "mongo") return "mongo:6";
  if (dbType === "clickhouse") return "clickhouse/clickhouse-server:latest";
  return "postgres:17-alpine";
}

function runDocker(args: string[]) {
  return new Promise<void>((resolvePromise, reject) => {
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
        resolvePromise();
      } else {
        reject(new Error((stderr || stdout || "Docker command failed").trim()));
      }
    });
  });
}

function shellQuote(value: string | number) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function delay(ms: number) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function retryReadiness(label: string, command: () => Promise<unknown>, timeoutMs = 45000) {
  const startedAt = Date.now();
  let lastError: unknown = null;
  while (Date.now() - startedAt <= timeoutMs) {
    try {
      await command();
      return;
    } catch (error) {
      lastError = error;
      await delay(1000);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${label} did not become ready`);
}

function envMapForService(serviceId: string) {
  const rows = db.select().from(envVars).where(eq(envVars.serviceId, serviceId)).all();
  return new Map(rows.map((row) => [row.key, row.value]));
}

async function ensureRuntimeNetwork() {
  await runDocker(["network", "inspect", config.runtimeNetworkName]).catch(async () => {
    await runDocker(["network", "create", config.runtimeNetworkName]);
  });
}

async function startDatabaseContainer(service: Service, envMap: Map<string, string>) {
  const dbType = databaseTypeForService(service);
  const containerName = containerNameForService(service.id);
  const image = databaseImage(dbType);
  const bindHost = service.databasePublicEnabled ? "0.0.0.0" : "127.0.0.1";
  const dockerArgs = [
    "run",
    "-d",
    "--restart",
    "unless-stopped",
    "--name",
    containerName,
    "--network",
    config.runtimeNetworkName,
    "--network-alias",
    service.slug,
    "-p",
    `${bindHost}:${service.hostPort}:${service.internalPort}`
  ];

  if (dbType === "clickhouse") {
    dockerArgs.push("--ulimit", "nofile=262144:262144");
  }
  for (const [key, value] of envMap) {
    dockerArgs.push("--env", `${key}=${value}`);
  }
  dockerArgs.push(image);

  await runDocker(["pull", image]);
  await ensureRuntimeNetwork();
  await runDocker(["rm", "-f", containerName]).catch(() => undefined);
  await runDocker(dockerArgs);
}

async function copyDumpToContainer(containerName: string, localPath: string) {
  const remotePath = `/tmp/aeroplane-import-${basename(localPath)}`;
  await runDocker(["cp", localPath, `${containerName}:${remotePath}`]);
  return remotePath;
}

async function waitForDatabase(service: Service, dbType: string, envMap: Map<string, string>, containerName: string) {
  if (dbType === "postgres") {
    const user = envMap.get("POSTGRES_USER") || "postgres";
    await retryReadiness("Postgres", () =>
      runDockerExec(containerName, ["pg_isready", "-h", "127.0.0.1", "-p", String(service.internalPort), "-U", user])
    );
    return;
  }

  if (dbType === "mysql") {
    const user = envMap.get("MYSQL_USER") || "root";
    const password = envMap.get("MYSQL_PASSWORD") || envMap.get("MYSQL_ROOT_PASSWORD") || "";
    await retryReadiness("MySQL", () =>
      runDockerExec(containerName, ["mysqladmin", "ping", "-h", "127.0.0.1", "-P", String(service.internalPort), "-u", user], { MYSQL_PWD: password })
    );
    return;
  }

  if (dbType === "mongodb" || dbType === "mongo") {
    const user = envMap.get("MONGO_INITDB_ROOT_USERNAME") || "mongo";
    const password = envMap.get("MONGO_INITDB_ROOT_PASSWORD") || "";
    const auth = password ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}@` : "";
    const uri = `mongodb://${auth}127.0.0.1:${service.internalPort}/?authSource=admin`;
    await retryReadiness("MongoDB", () => runDockerExec(containerName, ["mongosh", "--quiet", uri, "--eval", "db.runCommand({ ping: 1 }).ok"]));
    return;
  }

  if (dbType === "redis") {
    await retryReadiness("Redis", () => runDockerExec(containerName, ["redis-cli", "-h", "127.0.0.1", "-p", String(service.internalPort), "PING"]));
  }
}

async function restorePostgres(service: Service, envMap: Map<string, string>, containerName: string, localPath: string) {
  const remotePath = await copyDumpToContainer(containerName, localPath);
  const user = envMap.get("POSTGRES_USER") || "postgres";
  const password = envMap.get("POSTGRES_PASSWORD") || "";
  const dbName = envMap.get("POSTGRES_DB") || "aeroplane";
  await runDockerExec(
    containerName,
    ["pg_restore", "-h", "127.0.0.1", "-p", String(service.internalPort), "-U", user, "-d", dbName, "--clean", "--if-exists", "--no-owner", remotePath],
    { PGPASSWORD: password }
  );
  await runDockerExec(containerName, ["rm", "-f", remotePath]).catch(() => undefined);
}

async function restoreMysql(service: Service, envMap: Map<string, string>, containerName: string, localPath: string) {
  const remotePath = await copyDumpToContainer(containerName, localPath);
  const user = envMap.get("MYSQL_USER") || "root";
  const password = envMap.get("MYSQL_PASSWORD") || envMap.get("MYSQL_ROOT_PASSWORD") || "";
  const dbName = envMap.get("MYSQL_DATABASE") || "aeroplane";
  await runDockerExec(
    containerName,
    ["sh", "-lc", `mysql -h 127.0.0.1 -P ${Number(service.internalPort)} -u ${shellQuote(user)} ${shellQuote(dbName)} < ${shellQuote(remotePath)}`],
    { MYSQL_PWD: password }
  );
  await runDockerExec(containerName, ["rm", "-f", remotePath]).catch(() => undefined);
}

async function restoreMongo(service: Service, envMap: Map<string, string>, containerName: string, localPath: string) {
  const remotePath = await copyDumpToContainer(containerName, localPath);
  const user = envMap.get("MONGO_INITDB_ROOT_USERNAME") || "mongo";
  const password = envMap.get("MONGO_INITDB_ROOT_PASSWORD") || "";
  const auth = password ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}@` : "";
  const uri = `mongodb://${auth}127.0.0.1:${service.internalPort}/?authSource=admin`;
  await runDockerExec(containerName, ["mongorestore", `--archive=${remotePath}`, "--gzip", "--drop", "--uri", uri]);
  await runDockerExec(containerName, ["rm", "-f", remotePath]).catch(() => undefined);
}

async function restoreRedis(service: Service, containerName: string, localPath: string) {
  await runDockerExec(containerName, ["redis-cli", "-h", "127.0.0.1", "-p", String(service.internalPort), "FLUSHALL"]).catch(() => undefined);
  await runDocker(["cp", localPath, `${containerName}:/data/dump.rdb`]);
  await runDocker(["restart", containerName]);
}

export async function restoreDatabaseDump(dump: MigrationDatabaseDump, localPath: string) {
  const service = getServiceById(dump.serviceId);
  if (!service || !isDatabaseService(service)) {
    throw new Error(`Database service ${dump.serviceId} was not found`);
  }

  const dbType = databaseTypeForService(service);
  const envMap = envMapForService(service.id);
  const containerName = containerNameForService(service.id);
  await startDatabaseContainer(service, envMap);
  await waitForDatabase(service, dbType, envMap, containerName);

  if (dbType === "postgres") return restorePostgres(service, envMap, containerName, localPath);
  if (dbType === "mysql") return restoreMysql(service, envMap, containerName, localPath);
  if (dbType === "mongodb" || dbType === "mongo") return restoreMongo(service, envMap, containerName, localPath);
  if (dbType === "redis") return restoreRedis(service, containerName, localPath);

  throw new Error(`${dbType} restore is not available yet`);
}

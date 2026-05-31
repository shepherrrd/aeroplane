import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { config } from "./config.js";
import { db } from "./db.js";
import { domains, services } from "./schema.js";
import { ensureDefaultDomainsForExistingServices } from "./service-domains.js";
import { configuredControlPlaneHostname } from "./system-settings.js";

function shellWords(command: string) {
  return command.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((part) => part.replace(/^"|"$/g, "")) ?? [];
}

function caddyAddress(hostname: string) {
  return hostname === "localhost" || hostname.endsWith(".localhost") ? `http://${hostname}` : hostname;
}

function staticSiteDirForService(serviceId: string) {
  return resolve(process.env.DATA_DIR ?? config.dataDir, "static-sites", serviceId);
}

function currentControlPlaneHostname() {
  return configuredControlPlaneHostname();
}

function currentCaddyConfigPath() {
  return resolve(process.env.CADDY_CONFIG_PATH ?? config.caddyConfigPath);
}

function currentCaddyReloadCmd() {
  return process.env.CADDY_RELOAD_CMD ?? config.caddyReloadCmd;
}

function controlPlaneBlock() {
  const hostname = currentControlPlaneHostname();
  if (!hostname) return null;

  return `${caddyAddress(hostname)} {
  encode zstd gzip
  reverse_proxy 127.0.0.1:${config.port}
}`;
}

export function renderCaddyfile() {
  ensureDefaultDomainsForExistingServices();
  const routableService = or(inArray(services.status, ["active", "building"]), isNotNull(services.activePort));
  const domainMappings = db
    .select({
      serviceId: services.id,
      hostname: domains.hostname,
      hostPort: services.hostPort,
      activePort: services.activePort,
      staticOutput: services.staticOutput,
      repoUrl: services.repoUrl,
      repoFullName: services.repoFullName
    })
    .from(domains)
    .innerJoin(services, eq(services.id, domains.serviceId))
    .where(and(inArray(domains.status, ["active", "pending"]), routableService))
    .all();

  const blocks: string[] = [];
  const controlPlane = controlPlaneBlock();
  if (controlPlane) {
    blocks.push(controlPlane);
  }
  const controlPlaneHostname = currentControlPlaneHostname();

  for (const row of domainMappings) {
    const isDatabase = row.repoUrl === "database" || (row.repoFullName?.startsWith("database:") ?? false);
    if (isDatabase) continue;
    if (controlPlaneHostname && row.hostname === controlPlaneHostname) continue;

    if (row.staticOutput) {
      blocks.push(`${caddyAddress(row.hostname)} {
  root * ${staticSiteDirForService(row.serviceId)}
  try_files {path} {path}/ /index.html
  file_server
}`);
      continue;
    }

    const targetPort = row.activePort ?? row.hostPort;
    blocks.push(`${caddyAddress(row.hostname)} {
  encode zstd gzip
  reverse_proxy 127.0.0.1:${targetPort}
}`);
  }

  if (blocks.length === 0) {
    blocks.push(`http://127.0.0.1:65535 {
  respond "No active Aeroplane routes." 404
}`);
  }

  return [`# Managed by Aeroplane. Manual changes may be overwritten.`, ...blocks].join("\n\n") + "\n";
}

export async function writeAndReloadCaddy() {
  const caddyConfigPath = currentCaddyConfigPath();
  mkdirSync(dirname(caddyConfigPath), { recursive: true });
  writeFileSync(caddyConfigPath, renderCaddyfile(), "utf8");

  const [cmd, ...args] = shellWords(currentCaddyReloadCmd());
  if (!cmd) {
    return { ok: false, detail: "CADDY_RELOAD_CMD is empty" };
  }

  return new Promise<{ ok: boolean; detail: string }>((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("error", (error) => resolve({ ok: false, detail: error.message }));
    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        detail: output.trim() || `caddy reload exited with ${code}`
      });
    });
  });
}

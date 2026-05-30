import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "./config.js";
import { decryptSecret, encryptSecret } from "./secret-crypto.js";

export interface SystemSettings {
  rootDomain: string;
  controlPlaneHostname: string;
  r2?: R2Settings | null;
}

export interface R2Settings {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  connectedAt: string;
  updatedAt: string;
}

export type PublicR2Settings = {
  connected: boolean;
  accountId: string;
  bucket: string;
  endpoint: string;
  accessKeyIdSuffix: string;
  connectedAt: string | null;
  updatedAt: string | null;
};

const settingsPath = resolve(config.dataDir, "system-settings.json");

function decryptR2Settings(r2: SystemSettings["r2"]): SystemSettings["r2"] {
  if (!r2) return null;
  try {
    return {
      ...r2,
      secretAccessKey: decryptSecret(r2.secretAccessKey)
    };
  } catch (error) {
    console.error("Failed to decrypt R2 settings:", error);
    return {
      ...r2,
      secretAccessKey: ""
    };
  }
}

function serializeSystemSettings(settings: SystemSettings): SystemSettings {
  if (!settings.r2) return { ...settings, r2: null };
  return {
    ...settings,
    r2: {
      ...settings.r2,
      secretAccessKey: encryptSecret(settings.r2.secretAccessKey)
    }
  };
}

export function getSystemSettings(): SystemSettings {
  try {
    if (existsSync(settingsPath)) {
      const data = readFileSync(settingsPath, "utf8");
      const parsed = JSON.parse(data) as Partial<SystemSettings>;
      return {
        rootDomain: parsed.rootDomain ?? "",
        controlPlaneHostname: parsed.controlPlaneHostname ?? "",
        r2: decryptR2Settings(parsed.r2 ?? null)
      };
    }
  } catch (error) {
    console.error("Failed to read system settings:", error);
  }
  return {
    rootDomain: "",
    controlPlaneHostname: "",
    r2: null
  };
}

export function saveSystemSettings(settings: SystemSettings): void {
  try {
    writeFileSync(settingsPath, JSON.stringify(serializeSystemSettings(settings), null, 2), "utf8");
  } catch (error) {
    console.error("Failed to save system settings:", error);
  }
}

function publicUrlHostname() {
  try {
    const hostname = new URL(process.env.PUBLIC_URL ?? config.publicUrl).hostname.toLowerCase();
    if (!hostname || hostname === "localhost" || hostname === "::1") return "";
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return "";
    return hostname;
  } catch {
    return "";
  }
}

export function configuredControlPlaneHostname(settings = getSystemSettings()) {
  const envHostname = String(process.env.CONTROL_PLANE_HOSTNAME ?? config.controlPlaneHostname ?? "").trim().toLowerCase();
  return envHostname || String(settings.controlPlaneHostname ?? "").trim().toLowerCase() || publicUrlHostname();
}

export function publicR2Settings(settings = getSystemSettings()): PublicR2Settings {
  const r2 = settings.r2;
  if (!r2) {
    return {
      connected: false,
      accountId: "",
      bucket: "",
      endpoint: "",
      accessKeyIdSuffix: "",
      connectedAt: null,
      updatedAt: null
    };
  }

  return {
    connected: true,
    accountId: r2.accountId,
    bucket: r2.bucket,
    endpoint: r2.endpoint,
    accessKeyIdSuffix: r2.accessKeyId.slice(-6),
    connectedAt: r2.connectedAt,
    updatedAt: r2.updatedAt
  };
}

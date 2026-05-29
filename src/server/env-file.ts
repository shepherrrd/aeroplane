import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
const blockStart = "# --- Aeroplane managed settings ---";
const blockEnd = "# --- End Aeroplane managed settings ---";

export type ManagedEnvValues = Record<string, string | number | boolean | null | undefined>;

function quoteEnvValue(value: string) {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

function renderManagedBlock(values: ManagedEnvValues) {
  const lines = [blockStart];
  for (const [key, rawValue] of Object.entries(values)) {
    if (rawValue === undefined || rawValue === null || rawValue === "") continue;
    const value = String(rawValue);
    lines.push(`${key}=${quoteEnvValue(value)}`);
    process.env[key] = value;
  }
  lines.push(blockEnd);
  return lines.join("\n");
}

export function writeManagedEnv(values: ManagedEnvValues) {
  const source = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const block = renderManagedBlock(values);
  const startIndex = source.indexOf(blockStart);
  const endIndex = source.indexOf(blockEnd);

  let nextSource = "";
  if (startIndex >= 0 && endIndex > startIndex) {
    const before = source.slice(0, startIndex).trimEnd();
    const after = source.slice(endIndex + blockEnd.length).trimStart();
    nextSource = [before, block, after].filter(Boolean).join("\n\n");
  } else {
    nextSource = [source.trimEnd(), block].filter(Boolean).join("\n\n");
  }

  writeFileSync(envPath, `${nextSource.trimEnd()}\n`, "utf8");
  return envPath;
}

export function managedEnvPath() {
  return envPath;
}

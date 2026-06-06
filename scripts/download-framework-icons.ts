import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { DATABASE_ICON_CATALOG, FRAMEWORK_ICON_CATALOG, type FrameworkIconCatalogEntry } from "../src/server/framework-icon-catalog.js";

type SvglRoute = string | { dark?: string; light?: string };

type SvglLogo = {
  route?: SvglRoute;
  title: string;
  url?: string;
  wordmark?: SvglRoute;
};

type DownloadResult = {
  changed: boolean;
  entry: FrameworkIconCatalogEntry;
  error?: string;
  sourceUrl?: string;
};

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const force = args.has("--force");
const outputDir = resolve("src/server/assets/framework-icons");
const maxIconBytes = 350_000;

function normalizeSlug(value: string) {
  return value
    .replace(/\.(svg|png|webp|jpg|jpeg)$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function pickRoute(route: SvglRoute | undefined) {
  if (!route) return null;
  if (typeof route === "string") return route;
  return route.dark ?? route.light ?? null;
}

function svglAssetUrl(route: string | null) {
  if (!route) return null;
  if (/^https?:\/\//i.test(route)) return route;
  if (route.startsWith("/")) return `https://svgl.app${route}`;
  return `https://svgl.app/${route}`;
}

function entryTitles(entry: FrameworkIconCatalogEntry) {
  return [entry.search, entry.name, ...(entry.titleAliases ?? [])]
    .map((title) => title.toLowerCase())
    .filter(Boolean);
}

function pickSvglResult(entry: FrameworkIconCatalogEntry, results: SvglLogo[]) {
  const titles = entryTitles(entry);
  return (
    results.find((logo) => titles.includes(logo.title.toLowerCase())) ??
    results.find((logo) => titles.some((title) => logo.title.toLowerCase().includes(title))) ??
    null
  );
}

function looksLikeSvg(bytes: Buffer, contentType: string | null) {
  if (contentType?.toLowerCase().includes("svg")) return true;
  return bytes.subarray(0, 200).toString("utf8").trimStart().startsWith("<svg");
}

async function fetchSvg(sourceUrl: string) {
  const response = await fetch(sourceUrl, {
    headers: { Accept: "image/svg+xml,image/*" }
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > maxIconBytes) {
    throw new Error(`SVG is too large (${contentLength} bytes)`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxIconBytes) {
    throw new Error(`SVG is too large (${bytes.length} bytes)`);
  }
  if (!looksLikeSvg(bytes, response.headers.get("content-type"))) {
    throw new Error("response is not an SVG");
  }

  return bytes.toString("utf8");
}

async function searchSvgl(entry: FrameworkIconCatalogEntry) {
  const response = await fetch(`https://api.svgl.app?search=${encodeURIComponent(entry.search)}`, {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) return null;

  const results = (await response.json()) as SvglLogo[];
  const exact = pickSvglResult(entry, results);
  return svglAssetUrl(pickRoute(exact?.route) ?? pickRoute(exact?.wordmark));
}

async function resolveSourceUrls(entry: FrameworkIconCatalogEntry) {
  const urls: string[] = [];

  if (entry.sourceUrl) urls.push(entry.sourceUrl);
  if (entry.sourcePath) urls.push(svglAssetUrl(`/library/${entry.sourcePath}`) ?? "");

  if (!entry.sourceUrl) {
    const svglSearchUrl = await searchSvgl(entry).catch(() => null);
    if (svglSearchUrl) urls.push(svglSearchUrl);
  }

  return [...new Set(urls.filter(Boolean))];
}

async function writeIcon(entry: FrameworkIconCatalogEntry): Promise<DownloadResult> {
  const outputPath = join(outputDir, `${normalizeSlug(entry.slug)}.svg`);
  if (!force && !checkOnly && existsSync(outputPath)) {
    return { changed: false, entry };
  }

  const sourceUrls = await resolveSourceUrls(entry);
  if (sourceUrls.length === 0) {
    return { changed: false, entry, error: "no source URL found" };
  }

  const errors: string[] = [];
  for (const sourceUrl of sourceUrls) {
    try {
      const svg = await fetchSvg(sourceUrl);
      const existing = existsSync(outputPath) ? await readFile(outputPath, "utf8") : "";
      if (existing === svg) {
        return { changed: false, entry, sourceUrl };
      }

      if (!checkOnly) {
        await writeFile(outputPath, svg);
      }
      return { changed: true, entry, sourceUrl };
    } catch (error) {
      errors.push(`${sourceUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { changed: false, entry, error: errors.join("; ") };
}

async function main() {
  await mkdir(outputDir, { recursive: true });

  const entries = [...FRAMEWORK_ICON_CATALOG, ...DATABASE_ICON_CATALOG];
  const results: DownloadResult[] = [];

  for (const entry of entries) {
    const result = await writeIcon(entry);
    results.push(result);

    const label = `${entry.slug}.svg`;
    if (result.error) {
      console.error(`missing ${label}: ${result.error}`);
    } else if (result.changed) {
      console.log(`${checkOnly ? "would update" : "updated"} ${label}`);
    } else {
      console.log(`ok ${label}`);
    }
  }

  const missing = results.filter((result) => result.error);
  const changed = results.filter((result) => result.changed);
  console.log(`\n${entries.length - missing.length} ok, ${missing.length} missing, ${changed.length} ${checkOnly ? "would change" : "changed"}`);

  if (missing.length > 0 || (checkOnly && changed.length > 0)) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

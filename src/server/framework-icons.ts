import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DATABASE_ICON_CATALOG, FRAMEWORK_ICON_CATALOG, frameworkIconEntryForSlug, type FrameworkIconCatalogEntry } from "./framework-icon-catalog.js";

type IconMeta = {
  logoUrl: string | null;
  sourceUrl: string | null;
  website: string | null;
};

const checkedInFrameworkIconDir = resolve(process.env.AEROPLANE_FRAMEWORK_ICON_DIR ?? "src/server/assets/framework-icons");

function normalizeSlug(value: string) {
  return value
    .replace(/\.(svg|png|webp|jpg|jpeg)$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function iconPath(slug: string) {
  return join(checkedInFrameworkIconDir, `${normalizeSlug(slug)}.svg`);
}

function localIconUrl(slug: string) {
  return `/api/assets/framework-icons/${normalizeSlug(slug)}.svg`;
}

export function frameworkIconUrl(slug: string) {
  return localIconUrl(slug);
}

export async function cachedFrameworkIconMeta(entry: FrameworkIconCatalogEntry): Promise<IconMeta> {
  const slug = normalizeSlug(entry.slug);

  return {
    logoUrl: existsSync(iconPath(slug)) ? localIconUrl(slug) : null,
    sourceUrl: entry.sourceUrl ?? null,
    website: entry.website ?? null
  };
}

export async function frameworkIconAsset(fileName: string) {
  const slug = normalizeSlug(fileName);
  if (!slug) return null;

  const entry = frameworkIconEntryForSlug(slug);
  if (!entry) return null;

  const path = iconPath(slug);
  if (!existsSync(path)) return null;

  return {
    body: readFileSync(path),
    contentType: "image/svg+xml"
  };
}

export async function prewarmFrameworkIconCache() {
  const missing = [...FRAMEWORK_ICON_CATALOG, ...DATABASE_ICON_CATALOG]
    .filter((entry) => !existsSync(iconPath(entry.slug)))
    .map((entry) => entry.slug);

  if (missing.length > 0) {
    console.warn(`Missing checked-in framework icons: ${missing.join(", ")}`);
  }
}

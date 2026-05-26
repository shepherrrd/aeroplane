export function slugifyHostnamePart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "database";
}

export function generateDatabaseHostname(name: string, rootDomain: string) {
  const domain = rootDomain.trim().toLowerCase();
  if (!domain) return "";
  return `${slugifyHostnamePart(name)}.${domain}`;
}

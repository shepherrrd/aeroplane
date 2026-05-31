export function normalizeRootDomain(value: string | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").replace(/\.+$/, "").replace(/^\*\./, "");
}

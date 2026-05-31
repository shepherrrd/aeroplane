export function formatTime(value: null | string) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function shortSha(sha: null | string) {
  return sha ? sha.slice(0, 7) : "latest";
}

export function formatRelativeTime(value: string) {
  const delta = Date.now() - new Date(value).getTime();
  const hours = Math.max(1, Math.round(delta / (1000 * 60 * 60)));
  if (hours < 24) return `${hours}h ago`;
  const days = Math.max(1, Math.round(hours / 24));
  return `${days}d ago`;
}

export function formatBytes(value: null | number) {
  if (value === null || !Number.isFinite(value)) return "Unknown";
  if (value < 1000) return `${value} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let amount = value / 1000;
  let unitIndex = 0;

  while (amount >= 1000 && unitIndex < units.length - 1) {
    amount /= 1000;
    unitIndex += 1;
  }

  return `${amount >= 10 ? amount.toFixed(1) : amount.toFixed(2)} ${units[unitIndex]}`;
}

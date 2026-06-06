import type { BackupStorageTarget, DatabaseBackup as DatabaseBackupRecord, DatabaseBackupSettings } from "../../../api";
import { statusClass } from "../../ui/primitives";

export function formatBytes(value: number | null) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function backupStatusClass(status: DatabaseBackupRecord["status"]) {
  if (status === "succeeded") return statusClass("active");
  if (status === "running") return statusClass("building");
  return statusClass("failed");
}

export function storageLabel(storage: BackupStorageTarget, hasR2Key = false) {
  if (storage === "disk+r2") return hasR2Key ? "Disk + R2" : "Disk, R2 failed";
  if (storage === "r2") return "R2";
  return "Disk";
}

export function triggerLabel(trigger: DatabaseBackupRecord["trigger"]) {
  if (trigger === "manual") return "Manual";
  return trigger.charAt(0).toUpperCase() + trigger.slice(1);
}

export function defaultSettings(r2Connected: boolean): DatabaseBackupSettings {
  return {
    storage: r2Connected ? "disk+r2" : "disk",
    defaultStorage: r2Connected ? "disk+r2" : "disk",
    automaticEnabled: false,
    schedules: [
      { trigger: "daily", intervalHours: 24, retentionDays: 6 },
      { trigger: "weekly", intervalHours: 168, retentionDays: 31 },
      { trigger: "monthly", intervalHours: 720, retentionDays: 90 }
    ]
  };
}

export function retentionLabel(days: number) {
  if (days === 31) return "1 month";
  if (days === 90) return "3 months";
  return `${days} days`;
}

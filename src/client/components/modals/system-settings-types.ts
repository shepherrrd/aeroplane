export const systemSettingsTabValues = ["root-domain", "storage", "updates"] as const;

export type SystemSettingsTab = (typeof systemSettingsTabValues)[number];

export function isSystemSettingsTab(value: unknown): value is SystemSettingsTab {
  return typeof value === "string" && systemSettingsTabValues.includes(value as SystemSettingsTab);
}

import {
  CheckmarkCircle02Icon,
  CloudUploadIcon,
  HardDriveIcon,
  Refresh03Icon,
  Settings01Icon
} from "@hugeicons/core-free-icons";
import type { BackupScheduleEnabled, BackupScheduleTrigger, BackupStorageTarget, DatabaseBackupSettings } from "../../../api";
import { AppIcon, FieldLabel, shellButton } from "../../ui/primitives";
import { ModalShell } from "../modal-shell";
import { retentionLabel, triggerLabel } from "./backup-format";

type BackupSettingsModalProps = {
  open: boolean;
  activeSettings: DatabaseBackupSettings;
  r2Connected: boolean;
  draftStorage: BackupStorageTarget;
  draftScheduleEnabled: BackupScheduleEnabled;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onDraftStorageChange: (storage: BackupStorageTarget) => void;
  onDraftScheduleChange: (trigger: BackupScheduleTrigger, enabled: boolean) => void;
};

export function BackupSettingsModal({
  open,
  activeSettings,
  r2Connected,
  draftStorage,
  draftScheduleEnabled,
  saving,
  onClose,
  onSave,
  onDraftStorageChange,
  onDraftScheduleChange
}: BackupSettingsModalProps) {
  return (
    <ModalShell
      open={open}
      title="Backup Settings"
      meta="Destination and automation"
      icon={Settings01Icon}
      onClose={onClose}
      width="max-w-2xl"
    >
      <div className="space-y-6">
        <div>
          <FieldLabel>Backup destination</FieldLabel>
          <div className="grid gap-3 md:grid-cols-3">
            {([
              { value: "disk" as const, label: "Disk", icon: HardDriveIcon, disabled: false },
              { value: "r2" as const, label: "R2", icon: CloudUploadIcon, disabled: !r2Connected },
              { value: "disk+r2" as const, label: "Both", icon: CloudUploadIcon, disabled: !r2Connected }
            ]).map((option) => (
              <button
                key={option.value}
                type="button"
                className={`flex min-h-24 flex-col items-start justify-between border p-4 text-left transition ${
                  draftStorage === option.value
                    ? "border-[#4FB8B2]/50 bg-[#4FB8B2]/12 text-[#7fe3dd]"
                    : "border-zinc-800 bg-zinc-950/55 text-zinc-300 hover:border-zinc-700"
                } ${option.disabled ? "cursor-not-allowed opacity-45" : ""}`}
                onClick={() => {
                  if (!option.disabled) onDraftStorageChange(option.value);
                }}
                disabled={option.disabled}
              >
                <AppIcon icon={option.icon} size={17} />
                <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em]">{option.label}</span>
              </button>
            ))}
          </div>
          {!r2Connected ? (
            <p className="mt-3 text-xs leading-5 text-zinc-500">
              R2 is not connected, so disk is the default destination.
            </p>
          ) : null}
        </div>

        <div className="border border-zinc-800 bg-zinc-950/40 p-4">
          <div>
            <span className="block text-sm font-medium text-zinc-100">Automatic schedules</span>
            <span className="mt-1 block text-xs leading-5 text-zinc-500">
              Selected schedules run in the background using the chosen destination.
            </span>
          </div>

          <div className="mt-4 grid gap-2">
            {activeSettings.schedules.map((schedule) => {
              const enabled = draftScheduleEnabled[schedule.trigger];
              return (
                <button
                  key={schedule.trigger}
                  type="button"
                  className={`flex items-center justify-between gap-3 border px-3 py-2 text-left transition ${
                    enabled ? "border-[#4FB8B2]/40 bg-[#4FB8B2]/10" : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
                  }`}
                  onClick={() => onDraftScheduleChange(schedule.trigger, !enabled)}
                >
                  <span>
                    <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-300">{triggerLabel(schedule.trigger)}</span>
                    <span className="mt-1 block text-xs text-zinc-500">
                      every {schedule.intervalHours === 24 ? "24 hours" : schedule.intervalHours === 168 ? "7 days" : "30 days"}, kept for {retentionLabel(schedule.retentionDays)}
                    </span>
                  </span>
                  <span className={`h-6 w-11 shrink-0 border p-0.5 transition ${enabled ? "border-[#4FB8B2]/50 bg-[#4FB8B2]/20" : "border-zinc-700 bg-zinc-900"}`}>
                    <span className={`block h-4 w-4 bg-current transition ${enabled ? "translate-x-5 text-[#7fe3dd]" : "translate-x-0 text-zinc-500"}`} />
                  </span>
                  <span className="sr-only">
                    {enabled ? "Disable" : "Enable"} {triggerLabel(schedule.trigger).toLowerCase()} backups
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-5">
          <button type="button" className={shellButton("ghost")} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className={shellButton("primary")} onClick={onSave} disabled={saving}>
            <AppIcon icon={saving ? Refresh03Icon : CheckmarkCircle02Icon} size={15} className={saving ? "animate-spin" : ""} />
            Save settings
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

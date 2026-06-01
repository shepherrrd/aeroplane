import {
  CheckmarkCircle02Icon,
  CloudUploadIcon,
  HardDriveIcon,
  Refresh03Icon,
  Settings01Icon
} from "@hugeicons/core-free-icons";
import type { BackupStorageTarget, DatabaseBackupSettings } from "../../../api";
import { AppIcon, FieldLabel, shellButton } from "../../ui/primitives";
import { ModalShell } from "../modal-shell";
import { retentionLabel, triggerLabel } from "./backup-format";

type BackupSettingsModalProps = {
  open: boolean;
  activeSettings: DatabaseBackupSettings;
  r2Connected: boolean;
  draftStorage: BackupStorageTarget;
  draftAutomatic: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onDraftStorageChange: (storage: BackupStorageTarget) => void;
  onDraftAutomaticChange: (automatic: boolean) => void;
};

export function BackupSettingsModal({
  open,
  activeSettings,
  r2Connected,
  draftStorage,
  draftAutomatic,
  saving,
  onClose,
  onSave,
  onDraftStorageChange,
  onDraftAutomaticChange
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
          <button
            type="button"
            className="flex w-full items-center justify-between gap-4 text-left"
            onClick={() => onDraftAutomaticChange(!draftAutomatic)}
          >
            <span>
              <span className="block text-sm font-medium text-zinc-100">Automatic backups</span>
              <span className="mt-1 block text-xs leading-5 text-zinc-500">
                Daily, weekly, and monthly backups run in the background using the selected destination.
              </span>
            </span>
            <span className={`h-6 w-11 border p-0.5 transition ${draftAutomatic ? "border-[#4FB8B2]/50 bg-[#4FB8B2]/20" : "border-zinc-700 bg-zinc-900"}`}>
              <span className={`block h-4 w-4 bg-current transition ${draftAutomatic ? "translate-x-5 text-[#7fe3dd]" : "translate-x-0 text-zinc-500"}`} />
            </span>
          </button>

          <div className="mt-4 grid gap-2">
            {activeSettings.schedules.map((schedule) => (
              <div key={schedule.trigger} className="flex items-center justify-between gap-3 border border-zinc-800 bg-zinc-900/40 px-3 py-2">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-300">{triggerLabel(schedule.trigger)}</span>
                <span className="text-xs text-zinc-500">
                  every {schedule.intervalHours === 24 ? "24 hours" : schedule.intervalHours === 168 ? "7 days" : "30 days"}, kept for {retentionLabel(schedule.retentionDays)}
                </span>
              </div>
            ))}
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

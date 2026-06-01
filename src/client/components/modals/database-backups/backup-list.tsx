import {
  Archive01Icon,
  ArchiveRestoreIcon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  Download01Icon,
  Refresh03Icon
} from "@hugeicons/core-free-icons";
import { api, type DatabaseBackup as DatabaseBackupRecord } from "../../../api";
import { AppIcon } from "../../ui/primitives";
import { backupStatusClass, formatBytes, formatDate, storageLabel, triggerLabel } from "./backup-format";

type BackupListProps = {
  serviceId: string;
  backups: DatabaseBackupRecord[];
  loading: boolean;
  busy: string;
  deleteId: string;
  restoreId: string;
  onDeletePrompt: (backupId: string) => void;
  onRestorePrompt: (backupId: string) => void;
  onDelete: (backupId: string) => void;
  onRestore: (backupId: string) => void;
};

export function BackupList({
  serviceId,
  backups,
  loading,
  busy,
  deleteId,
  restoreId,
  onDeletePrompt,
  onRestorePrompt,
  onDelete,
  onRestore
}: BackupListProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto border border-zinc-800 bg-zinc-950/45">
      {backups.length === 0 ? (
        <div className="flex min-h-full items-center justify-center p-8 text-center">
          <div>
            <div className="mx-auto grid h-12 w-12 place-items-center border border-zinc-800 bg-zinc-900 text-zinc-500">
              <AppIcon icon={Archive01Icon} size={20} />
            </div>
            <h4 className="mt-4 font-hero text-lg text-zinc-100">{loading ? "Loading backups" : "No backups yet"}</h4>
            <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
              Create a backup now, or let automatic daily, weekly, and monthly backups take over.
            </p>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-zinc-800">
          {backups.map((backup) => {
            const deleting = busy === `delete:${backup.id}`;
            const restoring = busy === `restore:${backup.id}`;
            return (
              <div key={backup.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] ${backupStatusClass(backup.status)}`}>
                      {backup.status}
                    </span>
                    <span className="border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                      {triggerLabel(backup.trigger)}
                    </span>
                    <span className="border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                      {storageLabel(backup.storage, Boolean(backup.r2Key))}
                    </span>
                    <span className="border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                      {formatBytes(backup.sizeBytes)}
                    </span>
                  </div>
                  <div className="mt-3 truncate font-mono text-xs text-zinc-100">{backup.fileName ?? backup.id}</div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                    <span>{backup.engine}</span>
                    <span>{backup.format}</span>
                    <span>{formatDate(backup.createdAt)}</span>
                    {backup.r2Key ? <span className="normal-case tracking-normal text-[#7fe3dd]">{backup.r2Key}</span> : null}
                  </div>
                  {backup.error ? <div className="mt-3 text-xs leading-relaxed text-rose-300">{backup.error}</div> : null}
                </div>

                <div className="flex flex-wrap items-start justify-end gap-2">
                  {backup.status === "succeeded" ? (
                    <>
                      <a
                        href={api.databaseBackupDownloadUrl(serviceId, backup.id)}
                        className="inline-flex h-9 w-9 items-center justify-center border border-zinc-700 bg-zinc-900 text-zinc-300 transition hover:border-[#4FB8B2]/45 hover:bg-[#4FB8B2]/10 hover:text-[#7fe3dd]"
                        title="Download backup"
                        aria-label="Download backup"
                      >
                        <AppIcon icon={Download01Icon} size={15} />
                      </a>
                      {restoreId === backup.id ? (
                        <div className="flex items-center gap-1 border border-amber-500/35 bg-amber-950/20 p-1">
                          <span className="px-2 text-xs text-amber-100">Restore?</span>
                          <button type="button" className="inline-flex h-8 w-8 items-center justify-center text-amber-100 hover:bg-amber-500/10" onClick={() => onRestore(backup.id)} disabled={restoring} title="Yes" aria-label="Yes">
                            <AppIcon icon={restoring ? Refresh03Icon : CheckmarkCircle02Icon} size={15} className={restoring ? "animate-spin" : ""} />
                          </button>
                          <button type="button" className="inline-flex h-8 w-8 items-center justify-center text-zinc-300 hover:bg-zinc-800" onClick={() => onRestorePrompt("")} disabled={restoring} title="No" aria-label="No">
                            <AppIcon icon={Cancel01Icon} size={15} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="inline-flex h-9 w-9 items-center justify-center border border-zinc-700 bg-zinc-900 text-zinc-300 transition hover:border-amber-500/45 hover:bg-amber-500/10 hover:text-amber-200"
                          onClick={() => onRestorePrompt(backup.id)}
                          title="Restore backup"
                          aria-label="Restore backup"
                        >
                          <AppIcon icon={ArchiveRestoreIcon} size={15} />
                        </button>
                      )}
                    </>
                  ) : null}
                  {deleteId === backup.id ? (
                    <div className="flex items-center gap-1 border border-rose-500/35 bg-rose-950/20 p-1">
                      <span className="px-2 text-xs text-rose-100">Delete?</span>
                      <button type="button" className="inline-flex h-8 w-8 items-center justify-center text-rose-200 hover:bg-rose-500/10" onClick={() => onDelete(backup.id)} disabled={deleting} title="Yes" aria-label="Yes">
                        <AppIcon icon={deleting ? Refresh03Icon : CheckmarkCircle02Icon} size={15} className={deleting ? "animate-spin" : ""} />
                      </button>
                      <button type="button" className="inline-flex h-8 w-8 items-center justify-center text-zinc-300 hover:bg-zinc-800" onClick={() => onDeletePrompt("")} disabled={deleting} title="No" aria-label="No">
                        <AppIcon icon={Cancel01Icon} size={15} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center border border-zinc-700 bg-zinc-900 text-zinc-300 transition hover:border-rose-500/45 hover:bg-rose-500/10 hover:text-rose-300"
                      onClick={() => onDeletePrompt(backup.id)}
                      title="Delete backup"
                      aria-label="Delete backup"
                    >
                      <AppIcon icon={Delete02Icon} size={15} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { CheckmarkCircle02Icon, DatabaseExportIcon, Download01Icon } from "@hugeicons/core-free-icons";
import { FormEvent, useState } from "react";
import { api } from "../../api";
import { formatBytes } from "../../lib/format";
import { AppIcon, FieldLabel, FormInput, shellButton, statusClass } from "../ui/primitives";

export function MigrationSettingsPanel() {
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [lastExport, setLastExport] = useState<{ fileName: string; sizeBytes: number } | null>(null);

  async function exportBundle(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLastExport(null);
    if (passphrase.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setError("Passphrases do not match.");
      return;
    }

    setExporting(true);
    try {
      const result = await api.exportMigrationBundle(passphrase);
      setLastExport(result);
      setPassphrase("");
      setConfirmPassphrase("");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not export migration bundle");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="border border-zinc-800 bg-zinc-950/45 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Migration</div>
            <h3 className="mt-2 font-hero text-2xl tracking-tight text-zinc-100">Export instance</h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
              Create an encrypted bundle with projects, services, settings, static files, backups, and database dumps.
            </p>
          </div>
          <span className={`px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] ${statusClass(lastExport ? "active" : "unknown")}`}>
            {exporting ? "Exporting" : lastExport ? "Ready" : "Encrypted"}
          </span>
        </div>

        <form onSubmit={exportBundle} className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <FieldLabel>Migration passphrase</FieldLabel>
            <FormInput type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="new-password" />
          </div>
          <div>
            <FieldLabel>Confirm passphrase</FieldLabel>
            <FormInput type="password" value={confirmPassphrase} onChange={(event) => setConfirmPassphrase(event.target.value)} autoComplete="new-password" />
          </div>

          {error ? <div className="border border-rose-500/35 bg-rose-950/25 px-4 py-3 text-sm text-rose-200 md:col-span-2">{error}</div> : null}
          {lastExport ? (
            <div className="flex items-center gap-2 border border-emerald-500/25 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-100 md:col-span-2">
              <AppIcon icon={CheckmarkCircle02Icon} size={15} />
              <span className="min-w-0 truncate">{lastExport.fileName}</span>
              <span className="font-mono text-xs text-emerald-200/70">{formatBytes(lastExport.sizeBytes)}</span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 md:col-span-2">
            <button type="submit" className={shellButton("primary")} disabled={exporting}>
              <AppIcon icon={exporting ? DatabaseExportIcon : Download01Icon} size={14} className={exporting ? "animate-pulse" : ""} />
              {exporting ? "Creating bundle" : "Download bundle"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

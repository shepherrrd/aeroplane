import { Cancel01Icon, CheckmarkCircle02Icon, CloudUploadIcon, Delete02Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { FormEvent, useEffect, useState } from "react";
import { api, type R2SettingsStatus } from "../../api";
import { Checkbox } from "../ui/checkbox";
import { AppIcon, FieldLabel, FormInput, shellButton, statusClass } from "../ui/primitives";

type R2FormState = {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  createBucket: boolean;
};

const emptyR2: R2SettingsStatus = {
  connected: false,
  accountId: "",
  bucket: "",
  endpoint: "",
  accessKeyIdSuffix: "",
  connectedAt: null,
  updatedAt: null
};

function blankForm(): R2FormState {
  return {
    accountId: "",
    bucket: "aeroplane-backups",
    accessKeyId: "",
    secretAccessKey: "",
    createBucket: true
  };
}

function formFromR2(r2: R2SettingsStatus): R2FormState {
  return {
    accountId: r2.accountId,
    bucket: r2.bucket || "aeroplane-backups",
    accessKeyId: r2.accessKeyIdSuffix ? `******${r2.accessKeyIdSuffix}` : "",
    secretAccessKey: "",
    createBucket: false
  };
}

export function R2StorageSettingsPanel({ open }: { open: boolean }) {
  const [r2, setR2] = useState<R2SettingsStatus>(emptyR2);
  const [form, setForm] = useState<R2FormState>(blankForm);
  const [editing, setEditing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError("");
    setSuccess("");

    void api.r2Settings()
      .then((result) => {
        if (cancelled) return;
        setR2(result.r2);
        setForm(result.r2.connected ? formFromR2(result.r2) : blankForm());
        setEditing(!result.r2.connected);
        setDisconnecting(false);
      })
      .catch((issue) => {
        if (!cancelled) setError(issue instanceof Error ? issue.message : "Could not load R2 settings");
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  async function saveConnection(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await api.updateR2Settings({
        accountId: form.accountId.trim(),
        bucket: form.bucket.trim(),
        accessKeyId: form.accessKeyId.trim(),
        secretAccessKey: form.secretAccessKey || undefined,
        createBucket: form.createBucket
      });
      setR2(result.r2);
      setForm(formFromR2(result.r2));
      setEditing(false);
      setDisconnecting(false);
      setSuccess("R2 connection saved.");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not save R2 connection");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await api.disconnectR2();
      setR2(result.r2);
      setForm(blankForm());
      setEditing(true);
      setDisconnecting(false);
      setSuccess("R2 connection removed.");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not disconnect R2");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {!editing && r2.connected ? (
        <section className="border border-zinc-800 bg-zinc-950/45 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">R2 storage</div>
              <h3 className="mt-2 font-hero text-2xl tracking-tight text-zinc-100">{r2.bucket}</h3>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
                Database backups can upload to this bucket after the local disk backup is created.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] ${statusClass("active")}`}>
                Connected
              </span>
              <button type="button" className="inline-flex h-9 w-9 items-center justify-center border border-zinc-700 bg-zinc-900 text-zinc-300 transition hover:border-[#4FB8B2]/45 hover:bg-[#4FB8B2]/10 hover:text-[#7fe3dd]" onClick={() => setEditing(true)} title="Edit R2 connection" aria-label="Edit R2 connection">
                <AppIcon icon={PencilEdit02Icon} size={15} />
              </button>
              <button type="button" className="inline-flex h-9 w-9 items-center justify-center border border-zinc-700 bg-zinc-900 text-zinc-300 transition hover:border-rose-500/45 hover:bg-rose-500/10 hover:text-rose-300" onClick={() => setDisconnecting(true)} title="Disconnect R2" aria-label="Disconnect R2">
                <AppIcon icon={Delete02Icon} size={15} />
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="border border-zinc-800 bg-zinc-900/50 p-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">Account</div>
              <div className="mt-2 truncate font-mono text-xs text-zinc-200">{r2.accountId}</div>
            </div>
            <div className="border border-zinc-800 bg-zinc-900/50 p-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">Endpoint</div>
              <div className="mt-2 truncate font-mono text-xs text-zinc-200">{r2.endpoint}</div>
            </div>
            <div className="border border-zinc-800 bg-zinc-900/50 p-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">Access key</div>
              <div className="mt-2 truncate font-mono text-xs text-zinc-200">******{r2.accessKeyIdSuffix}</div>
            </div>
          </div>

          {disconnecting ? (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border border-rose-500/35 bg-rose-950/20 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-rose-100">Disconnect R2?</div>
                <div className="mt-1 text-xs text-rose-200/75">Existing backup records stay in Aeroplane; future R2 uploads will be disabled.</div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" className="inline-flex h-9 w-9 items-center justify-center border border-rose-500/40 bg-rose-500/10 text-rose-200" onClick={() => void disconnect()} disabled={busy} title="Yes" aria-label="Yes">
                  <AppIcon icon={CheckmarkCircle02Icon} size={16} />
                </button>
                <button type="button" className="inline-flex h-9 w-9 items-center justify-center border border-zinc-700 bg-zinc-900 text-zinc-300" onClick={() => setDisconnecting(false)} disabled={busy} title="No" aria-label="No">
                  <AppIcon icon={Cancel01Icon} size={16} />
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {editing ? (
        <form onSubmit={saveConnection} className="space-y-5 border border-zinc-800 bg-zinc-950/45 p-6">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center border border-[#4FB8B2]/35 bg-[#4FB8B2]/10 text-[#7fe3dd]">
              <AppIcon icon={CloudUploadIcon} size={18} />
            </div>
            <div>
              <h3 className="font-hero text-lg tracking-tight text-zinc-100">{r2.connected ? "Edit R2 connection" : "Connect R2"}</h3>
              <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                Store R2 credentials in Aeroplane for database backups.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FieldLabel>Account ID</FieldLabel>
              <FormInput value={form.accountId} onChange={(event) => setForm({ ...form, accountId: event.target.value })} placeholder="Cloudflare account id" required />
            </div>
            <div>
              <FieldLabel>Bucket</FieldLabel>
              <FormInput value={form.bucket} onChange={(event) => setForm({ ...form, bucket: event.target.value })} placeholder="aeroplane-backups" required />
            </div>
            <div>
              <FieldLabel>Access key ID</FieldLabel>
              <FormInput value={form.accessKeyId} onChange={(event) => setForm({ ...form, accessKeyId: event.target.value })} placeholder="R2 access key id" required />
            </div>
            <div>
              <FieldLabel>Secret access key</FieldLabel>
              <FormInput
                type="password"
                value={form.secretAccessKey}
                onChange={(event) => setForm({ ...form, secretAccessKey: event.target.value })}
                placeholder={r2.connected ? "Leave blank to keep current secret" : "R2 secret access key"}
                required={!r2.connected}
              />
            </div>
          </div>

          <Checkbox
            checked={form.createBucket}
            label="Create or verify bucket"
            onChange={(createBucket) => setForm({ ...form, createBucket })}
          >
            <span className="text-sm text-zinc-300">Create or verify this bucket when saving</span>
          </Checkbox>

          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className={shellButton("primary")} disabled={busy}>
              <AppIcon icon={CloudUploadIcon} size={15} />
              {busy ? "Saving..." : "Save R2 connection"}
            </button>
            {r2.connected ? (
              <button type="button" className={shellButton("ghost")} onClick={() => {
                setForm(formFromR2(r2));
                setEditing(false);
              }} disabled={busy}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {error ? <div className="border border-rose-500/35 bg-rose-950/30 px-3.5 py-2.5 font-mono text-[10px] text-rose-300">{error}</div> : null}
      {success ? (
        <div className="flex items-center gap-2 border border-emerald-500/35 bg-emerald-950/30 px-3.5 py-2.5 font-mono text-[10px] text-emerald-300">
          <AppIcon icon={CheckmarkCircle02Icon} size={13} />
          {success}
        </div>
      ) : null}
    </div>
  );
}

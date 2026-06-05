import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  PencilEdit02Icon
} from "@hugeicons/core-free-icons";
import type { FormEvent } from "react";
import { AppIcon, FieldLabel, FormInput, shellButton, statusClass } from "../ui/primitives";
import type {
  DnsCredentialValues,
  DnsProviderConnection,
  DnsProviderDefinition
} from "./dns-management-data";
import { DnsProviderLogo } from "./dns-provider-logo";

function savedLabel(savedAt: string) {
  if (!savedAt) return "Saved in this session";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(savedAt));
}

export function DnsCredentialsForm({
  provider,
  values,
  connection,
  editing,
  error,
  busy = false,
  onChange,
  onSave,
  onEdit,
  onCancel,
  onDisconnect
}: {
  provider: DnsProviderDefinition;
  values: DnsCredentialValues;
  connection: DnsProviderConnection;
  editing: boolean;
  error: string;
  busy?: boolean;
  onChange: (values: DnsCredentialValues) => void;
  onSave: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onDisconnect: () => void;
}) {
  function saveCredentials(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    onSave();
  }

  if (connection.connected && !editing) {
    return (
      <section className="space-y-4 border border-zinc-800 bg-zinc-950/45 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className={`grid h-11 w-11 shrink-0 place-items-center border ${provider.logoFrameClass}`}>
              <DnsProviderLogo provider={provider} className="max-h-6 max-w-8" />
            </div>
            <div>
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">DNS provider</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h3 className="font-hero text-lg tracking-tight text-zinc-100">{provider.name}</h3>
                <span className={`px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] ${statusClass("active")}`}>
                  Connected
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center border border-zinc-700 bg-zinc-900 text-zinc-300 transition hover:border-[#4FB8B2]/45 hover:bg-[#4FB8B2]/10 hover:text-[#7fe3dd]"
              onClick={onEdit}
              disabled={busy}
              title="Edit DNS credentials"
              aria-label="Edit DNS credentials"
            >
              <AppIcon icon={PencilEdit02Icon} size={15} />
            </button>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center border border-zinc-700 bg-zinc-900 text-zinc-300 transition hover:border-rose-500/45 hover:bg-rose-500/10 hover:text-rose-300"
              onClick={onDisconnect}
              disabled={busy}
              title="Remove DNS credentials"
              aria-label="Remove DNS credentials"
            >
              <AppIcon icon={Delete02Icon} size={15} />
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="border border-zinc-800 bg-zinc-900/55 p-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">API key</div>
            <div className="mt-2 font-mono text-xs text-zinc-200">******{connection.keySuffix}</div>
          </div>
          <div className="border border-zinc-800 bg-zinc-900/55 p-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">Saved</div>
            <div className="mt-2 font-mono text-xs text-zinc-200">{savedLabel(connection.savedAt)}</div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={saveCredentials} className="space-y-4 border border-zinc-800 bg-zinc-950/45 p-5">
      <div className="flex items-start gap-3">
        <div className={`grid h-11 w-11 shrink-0 place-items-center border ${provider.logoFrameClass}`}>
          <DnsProviderLogo provider={provider} className="max-h-6 max-w-8" />
        </div>
        <div>
          <h3 className="font-hero text-lg tracking-tight text-zinc-100">{connection.connected ? `Edit ${provider.name}` : `Connect ${provider.name}`}</h3>
          <p className="mt-1 text-sm leading-relaxed text-zinc-400">Store provider credentials for DNS record automation.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {provider.fields.map((field) => (
          <div key={field.key}>
            <FieldLabel>{field.label}</FieldLabel>
            <FormInput
              type={field.type ?? "text"}
              value={values[field.key] ?? ""}
              onChange={(event) => onChange({ ...values, [field.key]: event.target.value })}
              placeholder={field.placeholder}
              required={field.required}
              autoComplete="off"
            />
          </div>
        ))}
      </div>

      {error ? <div className="border border-rose-500/35 bg-rose-950/25 px-3 py-2 font-mono text-[10px] text-rose-200">{error}</div> : null}

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className={shellButton("primary")} disabled={busy}>
          <AppIcon icon={CheckmarkCircle02Icon} size={15} />
          {busy ? "Saving..." : "Save credentials"}
        </button>
        {connection.connected ? (
          <button type="button" className={shellButton("ghost")} onClick={onCancel} disabled={busy}>
            <AppIcon icon={Cancel01Icon} size={15} />
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

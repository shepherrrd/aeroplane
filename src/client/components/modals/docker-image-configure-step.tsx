import { ArrowLeft01Icon, CheckmarkCircle02Icon, Delete02Icon, PackageIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { FormEvent, useMemo, useState } from "react";
import { dockerImageRepoFullName, validateDockerImageReference } from "../../../shared/service-source";
import { AppIcon, FieldLabel, FormInput, shellButton } from "../ui/primitives";

type EnvEntry = {
  key: string;
  value: string;
};

type DockerImageSubmitPayload = {
  name: string;
  repoFullName: string;
  repoUrl: string;
  branch: string;
  dockerImage: string;
  internalPort: number;
  env: EnvEntry[];
};

function nameFromImageReference(value: string) {
  const withoutDigest = value.split("@")[0] ?? value;
  const withoutTag = withoutDigest.replace(/:[^/:]+$/, "");
  return withoutTag.split("/").filter(Boolean).at(-1)?.replace(/[^a-zA-Z0-9_.-]+/g, "-") ?? "";
}

function upsertEnvEntry(entries: EnvEntry[], entry: EnvEntry) {
  const next = new Map(entries.map((item) => [item.key, item.value]));
  next.set(entry.key, entry.value);
  return Array.from(next.entries()).map(([key, value]) => ({ key, value }));
}

export function DockerImageConfigureStep({
  onBack,
  onSubmit,
  busy
}: {
  onBack: () => void;
  onSubmit: (payload: DockerImageSubmitPayload) => Promise<void>;
  busy: boolean;
}) {
  const [image, setImage] = useState("");
  const [name, setName] = useState("");
  const [internalPort, setInternalPort] = useState(8080);
  const [envEntries, setEnvEntries] = useState<EnvEntry[]>([]);
  const [envForm, setEnvForm] = useState<EnvEntry>({ key: "", value: "" });

  const imageValidation = useMemo(() => validateDockerImageReference(image), [image]);
  const canSubmit = imageValidation.ok && name.trim() && internalPort >= 1 && internalPort <= 65535;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!imageValidation.ok || !canSubmit) return;

    await onSubmit({
      name: name.trim(),
      repoFullName: dockerImageRepoFullName(imageValidation.image),
      repoUrl: "docker-image",
      branch: "latest",
      dockerImage: imageValidation.image,
      internalPort,
      env: envEntries
    });
  }

  function addEnvEntry() {
    const key = envForm.key.trim();
    if (!key || !/^[A-Z_][A-Z0-9_]*$/i.test(key)) return;
    setEnvEntries((current) => upsertEnvEntry(current, { key, value: envForm.value }));
    setEnvForm({ key: "", value: "" });
  }

  return (
    <form onSubmit={submit} className="flex min-h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="space-y-5">
          <div className="border border-zinc-700 bg-zinc-900/85 p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center border border-zinc-800 bg-zinc-950 text-zinc-300">
                <AppIcon icon={PackageIcon} size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <FieldLabel>Docker image</FieldLabel>
                <FormInput
                  value={image}
                  onChange={(event) => {
                    const nextImage = event.target.value;
                    setImage(nextImage);
                    setName((current) => current || nameFromImageReference(nextImage));
                  }}
                  placeholder="ghcr.io/org/app:latest"
                  autoComplete="off"
                  disabled={busy}
                  required
                />
                {image.trim() && !imageValidation.ok ? (
                  <p className="mt-2 text-xs text-rose-300">{imageValidation.error}</p>
                ) : (
                  <p className="mt-2 text-xs text-zinc-500">Public images work immediately. Private registries use the host Docker login.</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel>Service name</FieldLabel>
              <FormInput value={name} onChange={(event) => setName(event.target.value)} placeholder="api" disabled={busy} required />
            </div>
            <div>
              <FieldLabel>Internal port</FieldLabel>
              <FormInput
                type="number"
                min={1}
                max={65535}
                value={internalPort}
                onChange={(event) => setInternalPort(Number(event.target.value))}
                disabled={busy}
                required
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <FieldLabel>Environment variables</FieldLabel>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">{envEntries.length} set</span>
            </div>
            <div className="border border-zinc-800 bg-zinc-950/60">
              {envEntries.length === 0 ? (
                <div className="px-4 py-4 text-sm text-zinc-500">No variables yet.</div>
              ) : (
                envEntries.map((entry) => (
                  <div key={entry.key} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_auto] items-center gap-3 border-b border-zinc-800 px-3 py-2.5 last:border-b-0">
                    <div className="truncate font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-300">{entry.key}</div>
                    <div className="truncate font-mono text-xs text-zinc-500">{entry.value || "empty"}</div>
                    <button
                      type="button"
                      className="grid h-8 w-8 place-items-center border border-zinc-800 text-zinc-400 transition hover:border-rose-500/40 hover:text-rose-200"
                      onClick={() => setEnvEntries((current) => current.filter((item) => item.key !== entry.key))}
                      aria-label={`Remove ${entry.key}`}
                    >
                      <AppIcon icon={Delete02Icon} size={15} />
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_auto]">
              <FormInput value={envForm.key} onChange={(event) => setEnvForm({ ...envForm, key: event.target.value })} placeholder="KEY" disabled={busy} />
              <FormInput value={envForm.value} onChange={(event) => setEnvForm({ ...envForm, value: event.target.value })} placeholder="value" disabled={busy} />
              <button type="button" className={shellButton("secondary")} onClick={addEnvEntry} disabled={!envForm.key.trim() || busy}>
                <AppIcon icon={PlusSignIcon} size={15} />
                Add
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-zinc-800 pt-4">
        <button type="button" className={shellButton("ghost")} onClick={onBack} disabled={busy}>
          <AppIcon icon={ArrowLeft01Icon} size={16} />
          Back
        </button>
        <button type="submit" className={shellButton("primary")} disabled={!canSubmit || busy}>
          <AppIcon icon={CheckmarkCircle02Icon} size={16} />
          {busy ? "Creating..." : "Create service"}
        </button>
      </div>
    </form>
  );
}

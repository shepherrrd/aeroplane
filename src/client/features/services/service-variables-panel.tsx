import { Add01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import type { ClipboardEvent } from "react";
import { api, type EnvVar } from "../../api";
import { AutocompleteInput } from "../../components/ui/autocomplete-input";
import { AppIcon, FieldLabel, FormInput, shellButton } from "../../components/ui/primitives";
import { EnvVarRow } from "../../components/modals/env-var-row";

type ParsedEnvEntry = {
  key: string;
  value: string;
};

function parseEnvText(input: string): ParsedEnvEntry[] {
  const byKey = new Map<string, string>();

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separatorIndex = normalized.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = normalized.slice(0, separatorIndex).trim();
    const value = normalized.slice(separatorIndex + 1).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) continue;

    byKey.set(key, value);
  }

  return Array.from(byKey.entries()).map(([key, value]) => ({ key, value }));
}

export function ServiceVariablesPanel({
  serviceId,
  env,
  suggestions,
  busy,
  doAction
}: {
  serviceId: string;
  env: EnvVar[];
  suggestions: Array<{ key: string; label: string }>;
  busy: string;
  doAction: (label: string, action: () => Promise<void>) => Promise<void>;
}) {
  const [envForm, setEnvForm] = useState({ key: "", value: "" });
  const [envSearch, setEnvSearch] = useState("");
  const [newEnvOpen, setNewEnvOpen] = useState(false);
  const filteredEnv = env.filter((item) => item.key.toLowerCase().includes(envSearch.trim().toLowerCase()));

  async function populateEnvEntries(entries: ParsedEnvEntry[]) {
    await doAction("env", async () => {
      await Promise.all(entries.map((entry) => api.upsertEnv(serviceId, entry)));
      setEnvForm({ key: "", value: "" });
      setNewEnvOpen(false);
    });
  }

  function handleEnvPaste(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData("text");
    const entries = parseEnvText(text);
    if (entries.length === 0) return;

    event.preventDefault();

    if (entries.length === 1) {
      setNewEnvOpen(true);
      setEnvForm(entries[0]);
      return;
    }

    void populateEnvEntries(entries);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 border-b border-zinc-800 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="text-2xl text-zinc-100">{env.length} Service Variables</div>
          <div className="relative">
            <AppIcon icon={Search01Icon} size={16} className="pointer-events-none absolute left-3 top-3 text-zinc-500" />
            <FormInput value={envSearch} onChange={(event) => setEnvSearch(event.target.value)} placeholder="Search variables" className="w-64 pl-10" />
          </div>
        </div>
        <button type="button" className={shellButton("secondary")} onClick={() => setNewEnvOpen((current) => !current)}>
          <AppIcon icon={Add01Icon} size={16} />
          New variable
        </button>
      </div>

      {newEnvOpen ? (
        <form
          className="border border-zinc-700 bg-zinc-900/88 p-5"
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            void doAction("env", async () => {
              await api.upsertEnv(serviceId, envForm);
              setEnvForm({ key: "", value: "" });
              setNewEnvOpen(false);
            });
          }}
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto]">
            <div>
              <FieldLabel>Key</FieldLabel>
              <FormInput
                value={envForm.key}
                onChange={(event) => setEnvForm({ ...envForm, key: event.target.value })}
                onPaste={handleEnvPaste}
                placeholder="KEY"
                autoComplete="off"
                required
              />
            </div>
            <div>
              <FieldLabel>Value</FieldLabel>
              <AutocompleteInput
                type="text"
                value={envForm.value}
                onChange={(val) => setEnvForm({ ...envForm, value: val })}
                onPaste={handleEnvPaste}
                suggestions={suggestions}
                placeholder="VALUE"
                autoComplete="off"
                required
              />
            </div>
            <div className="flex items-end gap-2">
              <button type="submit" className={shellButton("primary")} disabled={busy === "env"}>
                Save
              </button>
              <button type="button" className={shellButton("ghost")} onClick={() => setNewEnvOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </form>
      ) : null}

      <div className="border border-zinc-700 bg-zinc-900/88">
        {filteredEnv.length === 0 ? (
          <div className="px-5 py-8 text-sm text-zinc-400">No service variables yet.</div>
        ) : (
          filteredEnv.map((item) => (
            <EnvVarRow
              key={item.id}
              item={item}
              busy={busy === "env"}
              suggestions={suggestions}
              onSave={async (key, value) => {
                await doAction("env", async () => {
                  if (key !== item.key) {
                    await api.deleteEnv(serviceId, item.id);
                  }
                  await api.upsertEnv(serviceId, { key, value });
                });
              }}
              onDelete={async () => {
                await doAction("env", async () => {
                  await api.deleteEnv(serviceId, item.id);
                });
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

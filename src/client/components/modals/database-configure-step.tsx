import { ArrowLeft01Icon, AddSquareIcon, Settings01Icon } from "@hugeicons/core-free-icons";
import { FormEvent, useEffect, useState } from "react";
import { AppIcon, FieldLabel, FormInput, shellButton } from "../ui/primitives";
import { getDatabaseOption, type DatabaseType, type EnvEntry } from "./database-service-options";

interface DatabaseConfigureStepProps {
  dbType: DatabaseType;
  onBack: () => void;
  onSubmit: (payload: {
    name: string;
    repoFullName: string;
    repoUrl: string;
    branch: string;
    internalPort: number;
    env: EnvEntry[];
  }) => Promise<void>;
  busy: boolean;
}

function generateRandomPassword(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let pwd = "";
  for (let i = 0; i < 16; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}

export function DatabaseConfigureStep({ dbType, onBack, onSubmit, busy }: DatabaseConfigureStepProps) {
  const [name, setName] = useState("");
  const [envEntries, setEnvEntries] = useState<EnvEntry[]>([]);
  const [newEnvOpen, setNewEnvOpen] = useState(false);
  const [envForm, setEnvForm] = useState<EnvEntry>({ key: "", value: "" });

  const dbOption = getDatabaseOption(dbType);
  const defaultPort = dbOption.defaultPort;
  const dbLabel = dbOption.name;

  // Pre-populate defaults
  useEffect(() => {
    setName(`${dbType}-db`);
    const password = generateRandomPassword();
    const list: EnvEntry[] = [];

    if (dbType === "postgres") {
      list.push({ key: "POSTGRES_DB", value: "deploy" });
      list.push({ key: "POSTGRES_USER", value: "postgres" });
      list.push({ key: "POSTGRES_PASSWORD", value: password });
    } else if (dbType === "mysql") {
      const userPassword = generateRandomPassword();
      list.push({ key: "MYSQL_DATABASE", value: "deploy" });
      list.push({ key: "MYSQL_USER", value: "mysql" });
      list.push({ key: "MYSQL_PASSWORD", value: userPassword });
      list.push({ key: "MYSQL_ROOT_PASSWORD", value: password });
    } else if (dbType === "redis") {
      list.push({ key: "REDIS_PASSWORD", value: password });
    } else if (dbType === "mongodb") {
      list.push({ key: "MONGO_INITDB_ROOT_USERNAME", value: "mongo" });
      list.push({ key: "MONGO_INITDB_ROOT_PASSWORD", value: password });
    } else if (dbType === "clickhouse") {
      list.push({ key: "CLICKHOUSE_DB", value: "deploy" });
      list.push({ key: "CLICKHOUSE_USER", value: "clickhouse" });
      list.push({ key: "CLICKHOUSE_PASSWORD", value: password });
      list.push({ key: "CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT", value: "1" });
    }

    setEnvEntries(list);
  }, [dbType]);

  function addEnvEntry() {
    if (!envForm.key.trim()) return;
    setEnvEntries((current) => {
      const next = current.filter((entry) => entry.key !== envForm.key.trim());
      next.push({ key: envForm.key.trim(), value: envForm.value });
      return next;
    });
    setEnvForm({ key: "", value: "" });
    setNewEnvOpen(false);
  }

  function handleFormSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    void onSubmit({
      name: name.trim(),
      repoFullName: `database:${dbType}`,
      repoUrl: "database",
      branch: "main",
      internalPort: defaultPort,
      env: envEntries
    });
  }

  return (
    <form onSubmit={handleFormSubmit} className="flex min-h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="space-y-5">
          <div className="flex items-center gap-3 border border-zinc-800 bg-zinc-950/80 p-4 mb-4">
            <div className="grid h-10 w-10 place-items-center border border-[#4FB8B2]/30 bg-[#4FB8B2]/10 text-[#7fe3dd]">
              <AppIcon icon={Settings01Icon} size={18} />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-zinc-100">Deploying {dbLabel}</h4>
              <p className="text-xs text-zinc-400">Exposing database engine on port {defaultPort}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FieldLabel>Service name</FieldLabel>
              <FormInput
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={`${dbType}-db`}
                required
                disabled={busy}
              />
            </div>
            <div>
              <FieldLabel>Database Port (Internal)</FieldLabel>
              <div className="flex h-11 items-center border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-500 font-mono">
                {defaultPort}
              </div>
            </div>
          </div>

          {/* Environment variables */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-800 pb-2">
              <span className="text-sm font-medium text-zinc-100">Database Credentials & Env Vars</span>
              <button
                type="button"
                className={shellButton("secondary")}
                onClick={() => setNewEnvOpen((current) => !current)}
                disabled={busy}
              >
                <AppIcon icon={AddSquareIcon} size={15} />
                Add variable
              </button>
            </div>

            {newEnvOpen ? (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto] border border-zinc-800 bg-zinc-950/40 p-4">
                <div>
                  <FieldLabel>Key</FieldLabel>
                  <FormInput
                    value={envForm.key}
                    onChange={(event) => setEnvForm({ ...envForm, key: event.target.value })}
                    placeholder="KEY"
                    required
                  />
                </div>
                <div>
                  <FieldLabel>Value</FieldLabel>
                  <FormInput
                    value={envForm.value}
                    onChange={(event) => setEnvForm({ ...envForm, value: event.target.value })}
                    placeholder="VALUE"
                    required
                  />
                </div>
                <div className="flex items-end gap-2">
                  <button type="button" className={shellButton("primary")} onClick={addEnvEntry}>
                    Save
                  </button>
                  <button
                    type="button"
                    className={shellButton("ghost")}
                    onClick={() => {
                      setNewEnvOpen(false);
                      setEnvForm({ key: "", value: "" });
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            <div className="overflow-hidden border border-zinc-800 bg-zinc-950/20">
              {envEntries.length === 0 ? (
                <div className="px-5 py-6 text-sm text-zinc-500 font-sans">No credentials configured.</div>
              ) : (
                envEntries.map((item) => (
                  <div
                    key={item.key}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_56px] items-center gap-4 border-b border-zinc-800/80 px-4 py-3.5 last:border-b-0"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="font-mono text-zinc-500 font-bold">{`{ }`}</span>
                      <span className="truncate font-mono text-xs uppercase tracking-wider text-zinc-200">
                        {item.key}
                      </span>
                    </div>
                    <div className="font-mono text-xs text-[#7fe3dd] bg-[#4FB8B2]/5 border border-[#4FB8B2]/10 px-2.5 py-1 select-all break-all max-h-16 overflow-y-auto">
                      {item.value}
                    </div>
                    <button
                      type="button"
                      className="ml-auto inline-flex h-8 w-8 items-center justify-center border border-zinc-800 hover:border-rose-500/35 hover:bg-rose-500/10 text-zinc-500 hover:text-rose-300 transition-colors"
                      onClick={() => setEnvEntries((current) => current.filter((entry) => entry.key !== item.key))}
                      disabled={busy}
                      title="Remove"
                    >
                      &times;
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-zinc-800 pt-4 shrink-0">
        <button type="button" className={shellButton("ghost")} onClick={onBack} disabled={busy}>
          <AppIcon icon={ArrowLeft01Icon} size={16} />
          Back
        </button>
        <button type="submit" className={shellButton("primary")} disabled={busy || !name.trim()}>
          <AppIcon icon={AddSquareIcon} size={16} />
          {busy ? "Deploying..." : "Deploy Database"}
        </button>
      </div>
    </form>
  );
}

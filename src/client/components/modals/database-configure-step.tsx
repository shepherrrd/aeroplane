import { ArrowLeft01Icon, AddSquareIcon, Settings01Icon } from "@hugeicons/core-free-icons";
import { FormEvent, useEffect, useState } from "react";
import { api } from "../../api";
import { AppIcon, FieldLabel, FormInput, shellButton } from "../ui/primitives";
import { getDatabaseOption, type DatabaseType, type EnvEntry } from "./database-service-options";
import { generateDatabaseHostname } from "./database-hostname";
import { DatabasePublicAccessFields } from "./database-public-access-fields";

interface DatabaseConfigureStepProps {
  dbType: DatabaseType;
  onBack: () => void;
  onSubmit: (payload: {
    name: string;
    repoFullName: string;
    repoUrl: string;
    branch: string;
    internalPort: number;
    databasePublicEnabled: boolean;
    databasePublicHostname?: string;
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
  const [rootDomain, setRootDomain] = useState("");
  const [publicEnabled, setPublicEnabled] = useState(false);
  const [publicHostname, setPublicHostname] = useState("");

  const dbOption = getDatabaseOption(dbType);
  const defaultPort = dbOption.defaultPort;
  const dbLabel = dbOption.name;

  // Pre-populate defaults
  useEffect(() => {
    setName(`${dbType}-db`);
    const password = generateRandomPassword();
    const list: EnvEntry[] = [];

    if (dbType === "postgres") {
      list.push({ key: "POSTGRES_DB", value: "aeroplane" });
      list.push({ key: "POSTGRES_USER", value: "postgres" });
      list.push({ key: "POSTGRES_PASSWORD", value: password });
    } else if (dbType === "mysql") {
      const userPassword = generateRandomPassword();
      list.push({ key: "MYSQL_DATABASE", value: "aeroplane" });
      list.push({ key: "MYSQL_USER", value: "mysql" });
      list.push({ key: "MYSQL_PASSWORD", value: userPassword });
      list.push({ key: "MYSQL_ROOT_PASSWORD", value: password });
    } else if (dbType === "redis") {
      list.push({ key: "REDIS_PASSWORD", value: password });
    } else if (dbType === "mongodb") {
      list.push({ key: "MONGO_INITDB_ROOT_USERNAME", value: "mongo" });
      list.push({ key: "MONGO_INITDB_ROOT_PASSWORD", value: password });
    } else if (dbType === "clickhouse") {
      list.push({ key: "CLICKHOUSE_DB", value: "aeroplane" });
      list.push({ key: "CLICKHOUSE_USER", value: "clickhouse" });
      list.push({ key: "CLICKHOUSE_PASSWORD", value: password });
      list.push({ key: "CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT", value: "1" });
    }

    setEnvEntries(list);
    setPublicEnabled(false);
    setPublicHostname("");
  }, [dbType]);

  useEffect(() => {
    let cancelled = false;
    void api.systemSettings()
      .then((result) => {
        if (!cancelled) setRootDomain(result.settings.rootDomain);
      })
      .catch(() => {
        if (!cancelled) setRootDomain("");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPublicHostname(publicEnabled ? generateDatabaseHostname(name, rootDomain) : "");
  }, [name, publicEnabled, rootDomain]);

  function updateEnvValue(key: string, value: string) {
    setEnvEntries((current) => {
      const next = new Map(current.map((entry) => [entry.key, entry.value]));
      next.set(key, value);
      return Array.from(next.entries()).map(([entryKey, entryValue]) => ({ key: entryKey, value: entryValue }));
    });
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
      databasePublicEnabled: publicEnabled,
      databasePublicHostname: publicEnabled ? publicHostname.trim().toLowerCase() : undefined,
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
              <p className="text-xs text-zinc-400">Private runtime hostname now, public hostname only if enabled.</p>
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

          <DatabasePublicAccessFields
            enabled={publicEnabled}
            hostname={publicHostname}
            rootDomain={rootDomain}
            disabled={busy}
            onEnabledChange={(enabled) => {
              setPublicEnabled(enabled);
            }}
          />

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-800 pb-2">
              <span className="text-sm font-medium text-zinc-100">Database details</span>
            </div>

            <div className="overflow-hidden border border-zinc-800 bg-zinc-950/20">
              {envEntries.length === 0 ? (
                <div className="px-5 py-6 text-sm text-zinc-500 font-sans">No database details configured.</div>
              ) : (
                envEntries.map((item) => (
                  <div
                    key={item.key}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-4 border-b border-zinc-800/80 px-4 py-3.5 last:border-b-0"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="font-mono text-zinc-500 font-bold">{`{ }`}</span>
                      <span className="truncate font-mono text-xs uppercase tracking-wider text-zinc-200">
                        {item.key}
                      </span>
                    </div>
                    <FormInput
                      value={item.value}
                      onChange={(event) => updateEnvValue(item.key, event.target.value)}
                      disabled={busy}
                      autoComplete="off"
                      className="font-mono text-xs text-[#7fe3dd]"
                    />
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
        <button type="submit" className={shellButton("primary")} disabled={busy || !name.trim() || (publicEnabled && !publicHostname.trim())}>
          <AppIcon icon={AddSquareIcon} size={16} />
          {busy ? "Deploying..." : "Deploy Database"}
        </button>
      </div>
    </form>
  );
}

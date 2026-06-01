import { useEffect, useState } from "react";
import { api } from "../../api";
import { FieldLabel, FormInput } from "../ui/primitives";
import { generateDatabaseHostname } from "./database-hostname";

export type DatabaseSettingsState = {
  name: string;
  internalPort: number;
  databasePublicEnabled: boolean;
  databasePublicHostname: string;
};

type DatabaseServiceSettingsPanelProps = {
  settings: DatabaseSettingsState;
  hostPort?: number;
  onChange: (settings: DatabaseSettingsState) => void;
};

export function DatabaseServiceSettingsPanel({ settings, hostPort, onChange }: DatabaseServiceSettingsPanelProps) {
  const [rootDomain, setRootDomain] = useState("");
  const generatedHostname = generateDatabaseHostname(settings.name, rootDomain);

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
    if (!generatedHostname || settings.databasePublicHostname === generatedHostname) return;
    onChange({ ...settings, databasePublicHostname: generatedHostname });
  }, [generatedHostname, settings, onChange]);

  return (
    <>
      <div>
        <FieldLabel>Service name</FieldLabel>
        <FormInput value={settings.name} onChange={(event) => onChange({ ...settings, name: event.target.value })} />
      </div>
      <div>
        <FieldLabel>Database port (Internal)</FieldLabel>
        <FormInput
          type="number"
          value={settings.internalPort}
          onChange={(event) => onChange({ ...settings, internalPort: Number(event.target.value) })}
        />
      </div>
      <div className="xl:col-span-2">
        <div className="grid gap-4 border border-zinc-800 bg-zinc-950/35 p-4 md:grid-cols-2">
          <div>
            <FieldLabel>Public hostname</FieldLabel>
            <div className="flex h-11 min-w-0 items-center border border-zinc-800 bg-zinc-950 px-3 font-mono text-xs text-zinc-100">
              <span className="truncate">{settings.databasePublicHostname || generatedHostname || "Set root domain first"}</span>
            </div>
          </div>
          <div>
            <FieldLabel>Connection target</FieldLabel>
            <div className="flex h-11 min-w-0 items-center border border-zinc-800 bg-zinc-950 px-3 font-mono text-xs text-[#7fe3dd]">
              <span className="truncate">
                {settings.databasePublicHostname || generatedHostname
                  ? `${settings.databasePublicHostname || generatedHostname}:${hostPort ?? "<port>"}`
                  : `db.example.com:${hostPort ?? "<port>"}`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

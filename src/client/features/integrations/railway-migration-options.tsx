import { Checkbox } from "../../components/ui/checkbox";

type RailwayMigrationOptionsProps = {
  busy: boolean;
  excludeRailwayVars: boolean;
  importDatabases: boolean;
  autoDeploy: boolean;
  importDatabaseData: boolean;
  onExcludeRailwayVarsChange: (checked: boolean) => void;
  onImportDatabasesChange: (checked: boolean) => void;
  onAutoDeployChange: (checked: boolean) => void;
  onImportDatabaseDataChange: (checked: boolean) => void;
};

export function RailwayMigrationOptions({
  busy,
  excludeRailwayVars,
  importDatabases,
  autoDeploy,
  importDatabaseData,
  onExcludeRailwayVarsChange,
  onImportDatabasesChange,
  onAutoDeployChange,
  onImportDatabaseDataChange
}: RailwayMigrationOptionsProps) {
  const canImportDatabaseData = importDatabases && autoDeploy;

  return (
    <div className="flex flex-col justify-end space-y-2.5 pb-1">
      <Checkbox
        checked={excludeRailwayVars}
        onChange={onExcludeRailwayVarsChange}
        disabled={busy}
        label="Exclude RAILWAY_* variables"
      >
        <span className="text-xs text-zinc-300 font-semibold font-mono uppercase tracking-wider">
          Exclude RAILWAY_* variables
        </span>
      </Checkbox>

      <Checkbox
        checked={importDatabases}
        onChange={onImportDatabasesChange}
        disabled={busy}
        label="Recreate database engines"
      >
        <span className="text-xs text-zinc-300 font-semibold font-mono uppercase tracking-wider">
          Recreate database engines
        </span>
      </Checkbox>

      <Checkbox
        checked={autoDeploy}
        onChange={onAutoDeployChange}
        disabled={busy}
        label="Auto-deploy services"
      >
        <span className="text-xs text-zinc-300 font-semibold font-mono uppercase tracking-wider">
          Auto-deploy services
        </span>
      </Checkbox>

      <Checkbox
        checked={importDatabaseData && canImportDatabaseData}
        onChange={onImportDatabaseDataChange}
        disabled={busy || !canImportDatabaseData}
        label="Import database data"
      >
        <span className={`text-xs font-semibold font-mono uppercase tracking-wider ${canImportDatabaseData ? "text-zinc-300" : "text-zinc-600"}`}>
          Import database data
        </span>
      </Checkbox>
    </div>
  );
}

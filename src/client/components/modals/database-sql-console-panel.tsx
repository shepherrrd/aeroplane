import { PlayCircleIcon, Refresh03Icon } from "@hugeicons/core-free-icons";
import { FormEvent, useState } from "react";
import { api, type DatabaseQueryResult } from "../../api";
import { AppIcon, shellButton } from "../ui/primitives";
import { DatabaseResultTable } from "./database-result-table";
import { SqlEditor } from "./sql-editor";

const defaultSql = "SELECT * FROM your_table LIMIT 50;";

export function DatabaseSqlConsolePanel({ serviceId }: { serviceId: string }) {
  const [sql, setSql] = useState(defaultSql);
  const [result, setResult] = useState<DatabaseQueryResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function runQuery(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const nextResult = await api.databaseQuery(serviceId, sql);
      setResult(nextResult);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not run SQL query");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex h-full min-h-0 flex-col gap-4" onSubmit={runQuery}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4">
        <div>
          <h3 className="font-hero text-xl text-zinc-100">Console</h3>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            Run SQL against the selected database container
          </div>
        </div>
        <button type="submit" className={shellButton("primary")} disabled={busy}>
          <AppIcon icon={busy ? Refresh03Icon : PlayCircleIcon} size={15} className={busy ? "animate-spin" : ""} />
          Run query
        </button>
      </div>

      <SqlEditor value={sql} onChange={setSql} disabled={busy} />

      {error ? <div className="border border-rose-500/30 bg-rose-950/25 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

      {result ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            <span>{result.rowCount} rows</span>
            <span>{result.elapsedMs}ms</span>
            <span>{result.engine}</span>
          </div>
          {result.message ? (
            <pre className="max-h-32 overflow-auto border border-zinc-800 bg-zinc-950/70 p-3 font-mono text-xs whitespace-pre-wrap text-zinc-300">
              {result.message}
            </pre>
          ) : null}
          <div className="min-h-0 flex-1 overflow-hidden">
            <DatabaseResultTable columns={result.columns} rows={result.rows} emptyLabel="Query completed without returning rows." />
          </div>
        </div>
      ) : (
        <div className="border border-zinc-800 bg-zinc-950/45 px-5 py-8 text-sm text-zinc-500">
          Results will appear here after a query runs.
        </div>
      )}
    </form>
  );
}

import { Refresh03Icon } from "@hugeicons/core-free-icons";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, type DatabaseColumn, type DatabaseRow, type DatabaseRowsResponse, type DatabaseTable } from "../../api";
import { AppIcon, FieldLabel, FormInput, shellButton } from "../ui/primitives";
import { DatabaseTableGrid } from "./database-table-grid";

function rowValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function primaryKeyFor(columns: DatabaseColumn[], row: DatabaseRow) {
  const primaryColumns = columns.filter((column) => column.primaryKey);
  return Object.fromEntries(primaryColumns.map((column) => [column.name, row[column.name] ?? null]));
}

export function DatabaseBrowserPanel({ serviceId }: { serviceId: string }) {
  const [tables, setTables] = useState<DatabaseTable[]>([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [rowsResult, setRowsResult] = useState<DatabaseRowsResponse | null>(null);
  const [supported, setSupported] = useState(true);
  const [editable, setEditable] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [insertError, setInsertError] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftRow, setDraftRow] = useState<Record<string, string>>({});
  const [insertOpen, setInsertOpen] = useState(false);
  const [insertDraft, setInsertDraft] = useState<Record<string, string>>({});

  const columns = rowsResult?.columns ?? [];
  const rows = rowsResult?.rows ?? [];
  const hasPrimaryKey = columns.some((column) => column.primaryKey);

  const selectedTableName = useMemo(() => {
    return tables.find((table) => table.id === selectedTable)?.name ?? selectedTable;
  }, [selectedTable, tables]);

  async function loadTables() {
    setBusy("tables");
    setError("");
    try {
      const result = await api.databaseTables(serviceId);
      setSupported(result.supported);
      setEditable(result.editable);
      setTables(result.tables);
      setMessage(result.message ?? "");
      setSelectedTable(result.tables[0]?.id || "");
      if (result.tables.length === 0) setRowsResult(null);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not load database tables");
    } finally {
      setBusy("");
    }
  }

  async function loadRows(table = selectedTable) {
    if (!table) return;
    setBusy("rows");
    setError("");
    try {
      const result = await api.databaseRows(serviceId, table);
      setRowsResult(result);
      setEditable(result.editable);
      setEditingIndex(null);
      setInsertOpen(false);
      setInsertError("");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not load table rows");
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    void loadTables();
  }, [serviceId]);

  useEffect(() => {
    if (selectedTable) void loadRows(selectedTable);
  }, [selectedTable]);

  function beginEdit(index: number) {
    const row = rows[index];
    setEditingIndex(index);
    setDraftRow(Object.fromEntries(columns.map((column) => [column.name, rowValue(row[column.name])])));
  }

  async function saveEdit(row: DatabaseRow) {
    if (!rowsResult || editingIndex === null) return;
    setBusy("edit");
    setError("");
    try {
      await api.updateDatabaseRow(serviceId, {
        table: rowsResult.table,
        primaryKey: primaryKeyFor(columns, row),
        values: draftRow
      });
      await loadRows(rowsResult.table);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not save row");
    } finally {
      setBusy("");
    }
  }

  async function deleteRows(rowsToDelete: DatabaseRow[]) {
    if (!rowsResult || rowsToDelete.length === 0 || !window.confirm(`Delete ${rowsToDelete.length} selected row${rowsToDelete.length === 1 ? "" : "s"}?`)) return;
    setBusy("delete");
    setError("");
    try {
      for (const row of rowsToDelete) {
        await api.deleteDatabaseRow(serviceId, {
          table: rowsResult.table,
          primaryKey: primaryKeyFor(columns, row)
        });
      }
      await loadRows(rowsResult.table);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not delete selected rows");
    } finally {
      setBusy("");
    }
  }

  async function insertRow(event: FormEvent) {
    event.preventDefault();
    if (!rowsResult) return;
    setBusy("insert");
    setInsertError("");
    try {
      await api.insertDatabaseRow(serviceId, {
        table: rowsResult.table,
        values: insertDraft
      });
      await loadRows(rowsResult.table);
    } catch (issue) {
      setInsertError(issue instanceof Error ? issue.message : "Could not insert row");
    } finally {
      setBusy("");
    }
  }

  if (!supported) {
    return (
      <div className="border border-zinc-800 bg-zinc-950/45 p-6">
        <h3 className="font-hero text-lg text-zinc-100">Database browser unavailable</h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">{message}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[520px] gap-4">
      <aside className="w-64 flex-none overflow-hidden border border-zinc-800 bg-zinc-950/45">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Tables</div>
          <button type="button" className="text-zinc-400 hover:text-zinc-100" onClick={() => void loadTables()} disabled={busy === "tables"} aria-label="Refresh tables">
            <AppIcon icon={Refresh03Icon} size={15} />
          </button>
        </div>
        <div className="max-h-[470px] overflow-y-auto">
          {tables.length === 0 ? (
            <div className="px-4 py-5 text-sm text-zinc-500">No tables found.</div>
          ) : tables.map((table) => (
            <button
              key={table.id}
              type="button"
              className={`block w-full border-b border-zinc-900 px-4 py-3 text-left text-sm ${selectedTable === table.id ? "bg-zinc-800 text-zinc-100" : "text-zinc-300 hover:bg-zinc-900"}`}
              onClick={() => setSelectedTable(table.id)}
            >
              <span className="block truncate font-medium">{table.name}</span>
              <span className="mt-1 block truncate font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">{table.schema}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4">
          <div>
            <h3 className="font-hero text-xl text-zinc-100">{selectedTableName || "Data"}</h3>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">{rows.length} loaded rows</div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className={shellButton("ghost")} onClick={() => void loadRows()} disabled={!selectedTable || busy === "rows"}>
              <AppIcon icon={Refresh03Icon} size={15} />
              Refresh
            </button>
          </div>
        </div>

        {error ? <div className="mb-4 border border-rose-500/30 bg-rose-950/25 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
        {!hasPrimaryKey && editable && rows.length > 0 ? (
          <div className="mb-4 border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-xs text-amber-200">
            Editing and deleting require a primary key on this table.
          </div>
        ) : null}

        {columns.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center border border-zinc-800 bg-zinc-950/45 px-5 py-8 text-sm text-zinc-500">
            {busy ? "Loading table..." : "Choose a table to inspect rows."}
          </div>
        ) : (
          <DatabaseTableGrid
            columns={columns}
            rows={rows}
            editable={editable}
            hasPrimaryKey={hasPrimaryKey}
            busy={busy}
            editingIndex={editingIndex}
            draftRow={draftRow}
            onAddRecord={() => {
              setInsertDraft(Object.fromEntries(columns.map((column) => [column.name, ""])));
              setInsertError("");
              setInsertOpen(true);
            }}
            onBeginEdit={beginEdit}
            onCancelEdit={() => setEditingIndex(null)}
            onDeleteRows={(rowsToDelete) => void deleteRows(rowsToDelete)}
            onDraftChange={(column, value) => setDraftRow((current) => ({ ...current, [column]: value }))}
            onSaveEdit={(row) => void saveEdit(row)}
          />
        )}

        {insertOpen && rowsResult ? (
          <div className="fixed bottom-4 right-4 top-4 z-[60] w-full max-w-md border-l border-zinc-700 bg-zinc-950 shadow-[-24px_0_60px_rgba(0,0,0,0.35)]">
            <form onSubmit={insertRow} className="flex h-full flex-col">
              <div className="border-b border-zinc-800 px-5 py-4">
                <div className="font-hero text-lg text-zinc-100">Insert row</div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">{selectedTableName}</div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {insertError ? (
                  <div className="mb-4 border border-rose-500/30 bg-rose-950/25 px-4 py-3 text-sm text-rose-200">{insertError}</div>
                ) : null}
                <div className="space-y-4">
                  {columns.map((column) => (
                    <label key={column.name} className="block">
                      <FieldLabel>{column.name}</FieldLabel>
                      <FormInput
                        value={insertDraft[column.name] ?? ""}
                        onChange={(event) => setInsertDraft({ ...insertDraft, [column.name]: event.target.value })}
                        placeholder={column.type}
                      />
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-zinc-800 px-5 py-4">
                <button
                  type="button"
                  className={shellButton("ghost")}
                  onClick={() => {
                    setInsertOpen(false);
                    setInsertError("");
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className={shellButton("primary")} disabled={busy === "insert"}>Insert</button>
              </div>
            </form>
          </div>
        ) : null}
      </section>
    </div>
  );
}

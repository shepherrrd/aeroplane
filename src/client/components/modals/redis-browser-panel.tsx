import { Add01Icon, Cancel01Icon, CheckmarkCircle02Icon, Delete02Icon, PencilEdit02Icon, Refresh03Icon } from "@hugeicons/core-free-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { api, type DatabaseRow, type DatabaseRowsResponse, type DatabaseTable } from "../../api";
import { Dropdown } from "../ui/dropdown";
import { AppIcon, FormInput, shellButton } from "../ui/primitives";
import { DatabaseInsertSheet } from "./database-insert-sheet";
import { RedisDeleteKeyModal } from "./redis-delete-key-modal";
import { RedisHashTable } from "./redis-hash-table";
import { RedisKeyActionsMenu } from "./redis-key-actions-menu";
import { RedisTtlPopover } from "./redis-ttl-popover";

type RedisInsertMode = "key" | "item";

const numberFormatter = new Intl.NumberFormat();
const redisDatabaseOptions = Array.from({ length: 16 }, (_, database) => ({
  value: String(database),
  label: `DB ${database}`
}));

function valueText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function prettyValue(value: unknown) {
  const text = valueText(value);
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function itemCountLabel(table: DatabaseTable | null) {
  if (!table) return "0 items";
  if (table.rowCount === null) return "unknown";
  if (table.schema === "string") return `${numberFormatter.format(table.rowCount)} value`;
  return `${numberFormatter.format(table.rowCount)} item${table.rowCount === 1 ? "" : "s"}`;
}

function redisTypeTextClass(type: string) {
  if (type === "string") return "text-[#9af4ee]";
  if (type === "set") return "text-emerald-300";
  if (type === "hash") return "text-amber-300";
  if (type === "list") return "text-sky-300";
  if (type === "zset") return "text-violet-300";
  return "text-zinc-500";
}

function redisTypeBadgeClass(type: string) {
  if (type === "string") return "border-[#4FB8B2]/30 bg-[#4FB8B2]/10 text-[#9af4ee]";
  if (type === "set") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (type === "hash") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  if (type === "list") return "border-sky-500/30 bg-sky-500/10 text-sky-300";
  if (type === "zset") return "border-violet-500/30 bg-violet-500/10 text-violet-300";
  return "border-zinc-700 bg-zinc-900/80 text-zinc-400";
}

const redisMetaPillClass = "inline-flex h-7 items-center border px-2.5 font-mono text-[11px] leading-none tracking-[0.04em]";

function redisContentText(type: string, rows: DatabaseRow[]) {
  if (type === "string") return valueText(rows[0]?.value);
  if (type === "hash") {
    return JSON.stringify(
      Object.fromEntries(rows.map((row) => [valueText(row.field), row.value ?? ""])),
      null,
      2
    );
  }
  if (type === "list" || type === "set") {
    return JSON.stringify(rows.map((row) => row.value ?? ""), null, 2);
  }
  if (type === "zset") {
    return JSON.stringify(rows.map((row) => ({ member: row.member ?? "", score: row.score ?? 0 })), null, 2);
  }
  return JSON.stringify(rows, null, 2);
}

function redisItemMeta(type: string, row: DatabaseRow) {
  if (type === "hash") return valueText(row.field);
  if (type === "list") return valueText(row.index);
  if (type === "zset") return valueText(row.member);
  return "";
}

function redisItemValue(type: string, row: DatabaseRow) {
  if (type === "zset") return valueText(row.score);
  return valueText(row.value);
}

function redisItemId(type: string, row: DatabaseRow, index: number) {
  if (type === "hash") return `hash:${valueText(row.field)}`;
  if (type === "list") return `list:${valueText(row.index)}`;
  if (type === "set") return `set:${valueText(row.value)}`;
  if (type === "zset") return `zset:${valueText(row.member)}`;
  return `${type}:${index}`;
}

function redisEditDraft(type: string, row: DatabaseRow): Record<string, string> {
  if (type === "hash") return { field: valueText(row.field), value: valueText(row.value) };
  if (type === "zset") return { member: valueText(row.member), score: valueText(row.score) };
  return { value: redisItemValue(type, row) };
}

const redisInlineInputClass = "h-8 min-w-0 border border-zinc-700 bg-zinc-900 px-2 font-mono text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-[#4FB8B2]/60";

function RedisItems({
  type,
  rows,
  deleting,
  saving,
  onDeleteItem,
  onSaveItem
}: {
  type: string;
  rows: DatabaseRow[];
  deleting: boolean;
  saving: boolean;
  onDeleteItem: (row: DatabaseRow) => void;
  onSaveItem: (row: DatabaseRow, values: Record<string, string>) => Promise<void> | void;
}) {
  const [confirmingDeleteId, setConfirmingDeleteId] = useState("");
  const [editingItemId, setEditingItemId] = useState("");
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    setConfirmingDeleteId("");
    setEditingItemId("");
    setEditDraft({});
  }, [type, rows]);

  async function saveItem(row: DatabaseRow) {
    await onSaveItem(row, editDraft);
    setEditingItemId("");
    setEditDraft({});
  }

  if (type === "string") {
    const stringRow = rows[0] ?? { value: "" };
    const editing = editingItemId === "string";

    return (
      <div className="relative min-h-0 flex-1 overflow-auto border border-zinc-700 bg-zinc-950 p-4">
        {editing ? (
          <div className="flex h-full min-h-48 flex-col gap-3">
            <textarea
              value={editDraft.value ?? ""}
              onChange={(event) => setEditDraft((current) => ({ ...current, value: event.target.value }))}
              className="min-h-0 flex-1 resize-none border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm leading-6 text-zinc-100 outline-none transition focus:border-[#4FB8B2]/60"
              spellCheck={false}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center border border-[#4FB8B2]/35 bg-[#4FB8B2]/10 text-[#7fe3dd] transition hover:bg-[#4FB8B2]/15 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void saveItem(stringRow)}
                disabled={saving}
                title="Save value"
                aria-label="Save value"
              >
                <AppIcon icon={CheckmarkCircle02Icon} size={14} />
              </button>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center border border-zinc-800 bg-zinc-900/70 text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  setEditingItemId("");
                  setEditDraft({});
                }}
                disabled={saving}
                title="Cancel edit"
                aria-label="Cancel edit"
              >
                <AppIcon icon={Cancel01Icon} size={14} />
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center border border-zinc-800 bg-zinc-900/70 text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-100"
              onClick={() => {
                setEditingItemId("string");
                setEditDraft(redisEditDraft("string", stringRow));
              }}
              title="Edit value"
              aria-label="Edit value"
            >
              <AppIcon icon={PencilEdit02Icon} size={14} />
            </button>
            <pre className="whitespace-pre-wrap break-words pr-12 font-mono text-sm leading-6 text-emerald-200">{prettyValue(stringRow.value)}</pre>
          </>
        )}
      </div>
    );
  }

  if (type === "hash") {
    return (
      <RedisHashTable
        rows={rows}
        deleting={deleting}
        saving={saving}
        confirmingDeleteId={confirmingDeleteId}
        editingItemId={editingItemId}
        editDraft={editDraft}
        setConfirmingDeleteId={setConfirmingDeleteId}
        setEditingItemId={setEditingItemId}
        setEditDraft={setEditDraft}
        onDeleteItem={onDeleteItem}
        onSaveItem={onSaveItem}
      />
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto border border-zinc-700 bg-zinc-950">
      {rows.length === 0 ? (
        <div className="flex h-full min-h-48 items-center justify-center px-5 text-center text-sm text-zinc-500">No items in this key.</div>
      ) : rows.map((row, index) => {
        const itemId = redisItemId(type, row, index);
        const confirming = confirmingDeleteId === itemId;
        const editing = editingItemId === itemId;

        return (
          <div key={itemId} className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3 text-sm text-zinc-200">
            {editing ? (
              <>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {type === "hash" ? (
                    <input
                      value={editDraft.field ?? ""}
                      onChange={(event) => setEditDraft((current) => ({ ...current, field: event.target.value }))}
                      className={`${redisInlineInputClass} w-48 shrink-0`}
                      placeholder="field"
                    />
                  ) : type === "zset" ? (
                    <input
                      value={editDraft.member ?? ""}
                      onChange={(event) => setEditDraft((current) => ({ ...current, member: event.target.value }))}
                      className={`${redisInlineInputClass} w-48 shrink-0`}
                      placeholder="member"
                    />
                  ) : type === "list" ? (
                    <span className="inline-flex max-w-48 shrink-0 items-center border border-zinc-800 bg-zinc-900/70 px-2 py-1 font-mono text-[11px] tracking-[0.08em] text-zinc-500">
                      <span className="truncate">{redisItemMeta(type, row)}</span>
                    </span>
                  ) : null}
                  <input
                    value={type === "zset" ? editDraft.score ?? "" : editDraft.value ?? ""}
                    onChange={(event) => setEditDraft((current) => ({ ...current, [type === "zset" ? "score" : "value"]: event.target.value }))}
                    className={`${redisInlineInputClass} flex-1`}
                    placeholder={type === "zset" ? "score" : "value"}
                  />
                </div>
                <div className="flex shrink-0 items-center justify-end gap-2">
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center border border-[#4FB8B2]/35 bg-[#4FB8B2]/10 text-[#7fe3dd] transition hover:bg-[#4FB8B2]/15 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => void saveItem(row)}
                    disabled={saving}
                    title="Save item"
                    aria-label="Save item"
                  >
                    <AppIcon icon={CheckmarkCircle02Icon} size={14} />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center border border-zinc-800 bg-zinc-900/70 text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => {
                      setEditingItemId("");
                      setEditDraft({});
                    }}
                    disabled={saving}
                    title="Cancel edit"
                    aria-label="Cancel edit"
                  >
                    <AppIcon icon={Cancel01Icon} size={14} />
                  </button>
                </div>
              </>
            ) : confirming ? (
              <>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {type !== "set" ? (
                    <span className="inline-flex max-w-48 shrink-0 items-center border border-zinc-800 bg-zinc-900/70 px-2 py-1 font-mono text-[11px] tracking-[0.08em] text-zinc-500">
                      <span className="truncate">{redisItemMeta(type, row)}</span>
                    </span>
                  ) : null}
                  <span className="min-w-0 break-words font-mono text-sm text-zinc-200">{redisItemValue(type, row)}</span>
                </div>
                <div className="flex shrink-0 items-center justify-end gap-2">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-200">Confirm delete?</span>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center border border-rose-500/35 bg-rose-500/10 text-rose-200 transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => {
                      setConfirmingDeleteId("");
                      onDeleteItem(row);
                    }}
                    disabled={deleting}
                    title="Yes, delete item"
                    aria-label="Yes, delete item"
                  >
                    <AppIcon icon={CheckmarkCircle02Icon} size={14} />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center border border-zinc-800 bg-zinc-900/70 text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => setConfirmingDeleteId("")}
                    disabled={deleting}
                    title="No, cancel delete"
                    aria-label="No, cancel delete"
                  >
                    <AppIcon icon={Cancel01Icon} size={14} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {type !== "set" ? (
                    <span className="inline-flex max-w-48 shrink-0 items-center border border-zinc-800 bg-zinc-900/70 px-2 py-1 font-mono text-[11px] tracking-[0.08em] text-zinc-500">
                      <span className="truncate">{redisItemMeta(type, row)}</span>
                    </span>
                  ) : null}
                  <span className="min-w-0 break-words font-mono text-sm text-zinc-200">{redisItemValue(type, row)}</span>
                </div>
                <div className="flex shrink-0 items-center justify-end gap-2">
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center border border-zinc-800 bg-zinc-900/70 text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => {
                      setConfirmingDeleteId("");
                      setEditingItemId(itemId);
                      setEditDraft(redisEditDraft(type, row));
                    }}
                    disabled={saving || deleting}
                    title="Edit item"
                    aria-label="Edit item"
                  >
                    <AppIcon icon={PencilEdit02Icon} size={14} />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center border border-zinc-800 bg-zinc-900/70 text-zinc-400 transition hover:border-rose-500/35 hover:bg-rose-950/25 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => setConfirmingDeleteId(itemId)}
                    disabled={deleting}
                    title="Delete item"
                    aria-label="Delete item"
                  >
                    <AppIcon icon={Delete02Icon} size={14} />
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function RedisBrowserPanel({ serviceId }: { serviceId: string }) {
  const [keys, setKeys] = useState<DatabaseTable[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [rowsResult, setRowsResult] = useState<DatabaseRowsResponse | null>(null);
  const [selectedDatabase, setSelectedDatabase] = useState("0");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [insertOpen, setInsertOpen] = useState(false);
  const [insertMode, setInsertMode] = useState<RedisInsertMode>("key");
  const [insertError, setInsertError] = useState("");
  const [insertDraft, setInsertDraft] = useState<Record<string, string>>({});
  const [deleteOpen, setDeleteOpen] = useState(false);
  const rowsRequestId = useRef(0);

  const selectedKeyMeta = useMemo(() => keys.find((key) => key.id === selectedKey) ?? null, [keys, selectedKey]);
  const rowsBelongToSelectedKey = rowsResult?.table === selectedKey;
  const selectedType = selectedKeyMeta?.schema ?? (rowsBelongToSelectedKey ? rowsResult?.rows[0]?.type?.toString() : "") ?? "";
  const rows = rowsBelongToSelectedKey ? rowsResult?.rows ?? [] : [];
  const firstRow = rows[0] ?? {};

  const typeOptions = useMemo(() => {
    const types = Array.from(new Set(keys.map((key) => key.schema).filter(Boolean))).sort();
    return [{ value: "all", label: "All Types" }, ...types.map((type) => ({ value: type, label: type.toUpperCase() }))];
  }, [keys]);

  const filteredKeys = useMemo(() => {
    const query = search.trim().toLowerCase();
    return keys.filter((key) => {
      const matchesType = typeFilter === "all" || key.schema === typeFilter;
      const matchesSearch = !query || key.name.toLowerCase().includes(query);
      return matchesType && matchesSearch;
    });
  }, [keys, search, typeFilter]);

  async function loadKeys(logicalDatabase = selectedDatabase, currentKey = selectedKey) {
    setBusy("keys");
    setError("");
    try {
      const result = await api.databaseTables(serviceId, Number(logicalDatabase));
      setKeys(result.tables);
      const nextKey = result.tables.find((key) => key.id === currentKey)?.id ?? result.tables[0]?.id ?? "";
      setSelectedKey(nextKey);
      if (result.tables.length === 0) setRowsResult(null);
      return { tables: result.tables, selected: nextKey };
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not load Redis keys");
      return { tables: [], selected: "" };
    } finally {
      setBusy("");
    }
  }

  async function loadRows(key = selectedKey) {
    if (!key) return;
    const requestId = rowsRequestId.current + 1;
    rowsRequestId.current = requestId;
    setBusy("rows");
    setError("");
    setRowsResult(null);
    try {
      const result = await api.databaseRows(serviceId, key, 200, 0, []);
      if (rowsRequestId.current === requestId) setRowsResult(result);
    } catch (issue) {
      if (rowsRequestId.current === requestId) {
        setError(issue instanceof Error ? issue.message : "Could not load Redis key");
      }
    } finally {
      if (rowsRequestId.current === requestId) setBusy("");
    }
  }

  function openAddKey() {
    setInsertMode("key");
    setInsertDraft({ key: "", logicalDatabase: selectedDatabase, type: "string", field: "", member: "", score: "0", value: "", ttl: "" });
    setInsertError("");
    setInsertOpen(true);
  }

  function openAddItem() {
    if (!selectedKeyMeta) return;
    setInsertMode("item");
    setInsertDraft({
      key: selectedKeyMeta.name,
      logicalDatabase: selectedDatabase,
      type: selectedKeyMeta.schema,
      field: "",
      member: "",
      score: "0",
      value: "",
      ttl: ""
    });
    setInsertError("");
    setInsertOpen(true);
  }

  function insertSheetTitle() {
    if (insertMode === "key") return "Add key";
    if (selectedType === "hash") return "Add hash field";
    if (selectedType === "list") return "Add list item";
    if (selectedType === "set") return "Add set member";
    if (selectedType === "zset") return "Add sorted set member";
    return "Add item";
  }

  function insertButtonLabel() {
    if (insertMode === "key") return "Add key";
    if (selectedType === "set" || selectedType === "zset") return "Add member";
    if (selectedType === "hash") return "Add field";
    return "Add item";
  }

  async function insertRedis(event: FormEvent) {
    event.preventDefault();
    setBusy("insert");
    setInsertError("");
    try {
      const table = insertMode === "item" && selectedKey ? selectedKey : "__new__";
      const result = await api.insertDatabaseRow(serviceId, { table, values: insertDraft });
      setInsertOpen(false);
      const refreshed = await loadKeys(selectedDatabase);
      const nextKey = result.table ?? refreshed.selected;
      if (nextKey) {
        setSelectedKey(nextKey);
        await loadRows(nextKey);
      }
    } catch (issue) {
      setInsertError(issue instanceof Error ? issue.message : "Could not add Redis key");
    } finally {
      setBusy("");
    }
  }

  async function copyRedisText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  async function deleteSelectedKey() {
    if (!selectedKeyMeta) return;

    setBusy("delete");
    setError("");
    try {
      await api.deleteDatabaseRow(serviceId, { table: selectedKey, primaryKey: { key: selectedKeyMeta.name } });
      setDeleteOpen(false);
      const refreshed = await loadKeys(selectedDatabase);
      if (refreshed.selected) {
        await loadRows(refreshed.selected);
      } else {
        setRowsResult(null);
      }
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not delete Redis key");
    } finally {
      setBusy("");
    }
  }

  async function deleteRedisItem(row: DatabaseRow) {
    if (!selectedKeyMeta || !selectedKey) return;

    setBusy("delete");
    setError("");
    try {
      await api.deleteDatabaseRow(serviceId, {
        table: selectedKey,
        primaryKey: { ...row, key: selectedKeyMeta.name, type: selectedType }
      });
      const refreshed = await loadKeys(selectedDatabase);
      const nextKey = refreshed.tables.find((key) => key.id === selectedKey)?.id ?? refreshed.selected;
      if (nextKey) {
        await loadRows(nextKey);
      } else {
        setRowsResult(null);
      }
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not delete Redis item");
    } finally {
      setBusy("");
    }
  }

  async function saveRedisItem(row: DatabaseRow, values: Record<string, string>) {
    if (!selectedKeyMeta || !selectedKey) return;

    setBusy("save");
    setError("");
    try {
      await api.updateDatabaseRow(serviceId, {
        table: selectedKey,
        primaryKey: { ...row, key: selectedKeyMeta.name, type: selectedType },
        values
      });
      const refreshed = await loadKeys(selectedDatabase);
      const nextKey = refreshed.tables.find((key) => key.id === selectedKey)?.id ?? refreshed.selected;
      if (nextKey) {
        await loadRows(nextKey);
      } else {
        setRowsResult(null);
      }
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not save Redis item");
    } finally {
      setBusy("");
    }
  }

  async function saveRedisTtl(ttl: number) {
    if (!selectedKeyMeta || !selectedKey) return;

    setBusy("ttl");
    setError("");
    try {
      await api.updateDatabaseRow(serviceId, {
        table: selectedKey,
        primaryKey: { key: selectedKeyMeta.name },
        values: { ttl }
      });
      await loadRows(selectedKey);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not save Redis TTL");
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    rowsRequestId.current += 1;
    setSelectedDatabase("0");
    setSelectedKey("");
    setRowsResult(null);
    void loadKeys("0", "");
  }, [serviceId]);

  useEffect(() => {
    if (selectedKey) void loadRows(selectedKey);
  }, [selectedKey]);

  function changeDatabase(database: string) {
    rowsRequestId.current += 1;
    setSelectedDatabase(database);
    setSelectedKey("");
    setRowsResult(null);
    setTypeFilter("all");
    void loadKeys(database, "");
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Dropdown value={selectedDatabase} options={redisDatabaseOptions} onChange={changeDatabase} className="w-28" />
        <Dropdown value={typeFilter} options={typeOptions} onChange={setTypeFilter} className="w-44" />
        <FormInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search keys" className="min-w-64 flex-1" />
        <button type="button" className="inline-flex h-11 w-11 items-center justify-center border border-zinc-700 bg-zinc-900 text-zinc-300 transition hover:border-zinc-500 hover:text-white" onClick={() => void loadKeys(selectedDatabase)} disabled={busy === "keys"} aria-label="Refresh keys">
          <AppIcon icon={Refresh03Icon} size={16} />
        </button>
        <button type="button" className={shellButton("primary")} onClick={openAddKey} disabled={busy === "insert"}>
          <AppIcon icon={Add01Icon} size={15} />
          Key
        </button>
      </div>

      {error ? <div className="border border-rose-500/30 bg-rose-950/25 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col overflow-hidden border border-zinc-800 bg-zinc-950/45">
          <div className="border-b border-zinc-800 px-4 py-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            Keys
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {busy === "keys" && keys.length === 0 ? (
              <div className="flex h-full items-center justify-center text-center text-sm text-zinc-500">Loading keys...</div>
            ) : filteredKeys.length === 0 ? (
              <div className="flex h-full items-center justify-center text-center text-sm text-zinc-500">No keys found.</div>
            ) : filteredKeys.map((key) => {
              const selected = selectedKey === key.id;
              return (
                <button
                  key={key.id}
                  type="button"
                  className={`mb-1 flex w-full items-center justify-between gap-3 border px-3 py-3 text-left transition ${
                    selected
                      ? "border-[#4FB8B2]/55 bg-[#4FB8B2]/12 text-[#9af4ee]"
                      : "border-transparent text-zinc-300 hover:border-zinc-800 hover:bg-zinc-900"
                  }`}
                  onClick={() => {
                    if (selectedKey !== key.id) {
                      rowsRequestId.current += 1;
                      setRowsResult(null);
                      setSelectedKey(key.id);
                    }
                  }}
                >
                  <span className="min-w-0 truncate text-sm font-medium">{key.name}</span>
                  <span className={`shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] ${redisTypeTextClass(key.schema)}`}>{key.schema}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex min-h-0 flex-col border border-zinc-800 bg-zinc-950/45 p-5">
          {!selectedKeyMeta ? (
            <div className="flex min-h-0 flex-1 items-center justify-center text-center text-sm text-zinc-500">Choose a key to inspect its value.</div>
          ) : busy === "rows" && !rowsBelongToSelectedKey ? (
            <div className="flex min-h-0 flex-1 items-center justify-center text-center text-sm text-zinc-500">Loading key...</div>
          ) : (
            <>
              <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="truncate font-hero text-xl text-zinc-100">{selectedKeyMeta.name}</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`${redisMetaPillClass} font-semibold uppercase ${redisTypeBadgeClass(selectedType)}`}>{selectedType || "unknown"}</span>
                    {selectedType !== "string" ? (
                      <span className={`${redisMetaPillClass} border-zinc-700 bg-zinc-900/80 text-zinc-400`}>{itemCountLabel(selectedKeyMeta)}</span>
                    ) : null}
                    {selectedType === "string" && firstRow.bytes !== undefined ? (
                      <span className={`${redisMetaPillClass} border-zinc-700 bg-zinc-900/80 text-zinc-400`}>Size: {numberFormatter.format(Number(firstRow.bytes))} B</span>
                    ) : null}
                    <RedisTtlPopover ttl={firstRow.ttl} busy={busy === "ttl"} onSave={saveRedisTtl} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedType && selectedType !== "string" ? (
                    <button
                      type="button"
                      className="inline-flex h-10 w-10 items-center justify-center border border-zinc-800 bg-zinc-900/70 text-zinc-200 transition hover:border-zinc-700 hover:bg-zinc-900 disabled:opacity-60"
                      onClick={openAddItem}
                      disabled={busy === "insert"}
                      title="Add item"
                      aria-label="Add item"
                    >
                      <AppIcon icon={Add01Icon} size={15} />
                    </button>
                  ) : null}
                  <RedisKeyActionsMenu
                    disabled={busy === "delete"}
                    onCopyContent={() => copyRedisText(redisContentText(selectedType, rows))}
                    onCopyKey={() => copyRedisText(selectedKeyMeta.name)}
                    onDelete={() => setDeleteOpen(true)}
                  />
                </div>
              </div>
              <RedisItems
                type={selectedType}
                rows={rows}
                deleting={busy === "delete"}
                saving={busy === "save"}
                onDeleteItem={(row) => void deleteRedisItem(row)}
                onSaveItem={(row, values) => saveRedisItem(row, values)}
              />
            </>
          )}
        </div>
      </div>

      {insertOpen ? (
        <DatabaseInsertSheet
          engine="redis"
          title={insertSheetTitle()}
          subtitle={insertMode === "item" ? selectedKeyMeta?.name ?? "Redis key" : "Redis"}
          buttonLabel={insertButtonLabel()}
          columns={[]}
          draft={insertDraft}
          error={insertError}
          busy={busy}
          redisMode={insertMode}
          onDraftChange={setInsertDraft}
          onSubmit={insertRedis}
          onClose={() => {
            setInsertOpen(false);
            setInsertError("");
          }}
        />
      ) : null}

      <RedisDeleteKeyModal
        open={deleteOpen}
        keyName={selectedKeyMeta?.name ?? ""}
        busy={busy === "delete"}
        onClose={() => setDeleteOpen(false)}
        onConfirm={deleteSelectedKey}
      />
    </div>
  );
}

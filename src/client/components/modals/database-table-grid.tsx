import {
  Add01Icon,
  Delete02Icon,
  FilterHorizontalIcon,
  PencilEdit02Icon,
  Sorting05Icon,
  SortingDownIcon,
  SortingUpIcon,
  TableColumnsSplitIcon
} from "@hugeicons/core-free-icons";
import { useEffect, useMemo, useState } from "react";
import type { DatabaseColumn, DatabaseRow, DatabaseRowValue } from "../../api";
import { AppIcon } from "../ui/primitives";

type ToolbarPanel = "filters" | "sort" | "columns" | "";
type SortDirection = "asc" | "desc";

type DatabaseTableGridProps = {
  columns: DatabaseColumn[];
  rows: DatabaseRow[];
  editable: boolean;
  hasPrimaryKey: boolean;
  busy: string;
  editingIndex: number | null;
  draftRow: Record<string, string>;
  onAddRecord: () => void;
  onBeginEdit: (index: number) => void;
  onCancelEdit: () => void;
  onDeleteRow: (row: DatabaseRow) => void;
  onDraftChange: (column: string, value: string) => void;
  onSaveEdit: (row: DatabaseRow) => void;
};

function toolbarButton(active: boolean) {
  return `inline-flex h-10 items-center justify-center gap-2 border px-3 text-sm font-medium transition ${
    active
      ? "border-[#4FB8B2]/45 bg-[#4FB8B2]/12 text-[#7fe3dd]"
      : "border-zinc-700 bg-zinc-950/70 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900"
  }`;
}

function compareValues(left: DatabaseRowValue | undefined, right: DatabaseRowValue | undefined) {
  if (left === right) return 0;
  if (left === null || left === undefined) return 1;
  if (right === null || right === undefined) return -1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
}

function displayValue(value: DatabaseRowValue | undefined) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export function DatabaseTableGrid({
  columns,
  rows,
  editable,
  hasPrimaryKey,
  busy,
  editingIndex,
  draftRow,
  onAddRecord,
  onBeginEdit,
  onCancelEdit,
  onDeleteRow,
  onDraftChange,
  onSaveEdit
}: DatabaseTableGridProps) {
  const [activePanel, setActivePanel] = useState<ToolbarPanel>("");
  const [filterText, setFilterText] = useState("");
  const [sortColumn, setSortColumn] = useState("");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => new Set());
  const [selectedRows, setSelectedRows] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    const columnNames = new Set(columns.map((column) => column.name));
    setHiddenColumns((current) => new Set(Array.from(current).filter((name) => columnNames.has(name))));
    setSelectedRows(new Set<number>());
    setSortColumn((current) => (current && columnNames.has(current) ? current : ""));
  }, [columns, rows]);

  const visibleColumns = useMemo(() => columns.filter((column) => !hiddenColumns.has(column.name)), [columns, hiddenColumns]);

  const visibleRows = useMemo(() => {
    const normalizedFilter = filterText.trim().toLowerCase();
    const filtered = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => {
        if (!normalizedFilter) return true;
        return columns.some((column) => displayValue(row[column.name]).toLowerCase().includes(normalizedFilter));
      });

    if (!sortColumn) return filtered;

    return [...filtered].sort((left, right) => {
      const result = compareValues(left.row[sortColumn], right.row[sortColumn]);
      return sortDirection === "asc" ? result : -result;
    });
  }, [columns, filterText, rows, sortColumn, sortDirection]);

  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every(({ index }) => selectedRows.has(index));

  function togglePanel(panel: ToolbarPanel) {
    setActivePanel((current) => (current === panel ? "" : panel));
  }

  function toggleColumn(column: string) {
    setHiddenColumns((current) => {
      const next = new Set(current);
      if (next.has(column)) {
        next.delete(column);
      } else if (visibleColumns.length > 1) {
        next.add(column);
      }
      return next;
    });
  }

  function toggleVisibleRows() {
    setSelectedRows((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        visibleRows.forEach(({ index }) => next.delete(index));
      } else {
        visibleRows.forEach(({ index }) => next.add(index));
      }
      return next;
    });
  }

  function toggleRow(index: number) {
    setSelectedRows((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" className={toolbarButton(activePanel === "filters")} onClick={() => togglePanel("filters")}>
          <AppIcon icon={FilterHorizontalIcon} size={17} />
          Filters
          {filterText ? <span className="text-[#7fe3dd]">1</span> : null}
        </button>
        <button type="button" className={toolbarButton(activePanel === "sort")} onClick={() => togglePanel("sort")}>
          <AppIcon icon={Sorting05Icon} size={17} />
          Sort
          {sortColumn ? <span className="text-[#7fe3dd]">1</span> : null}
        </button>
        <button type="button" className={toolbarButton(activePanel === "columns")} onClick={() => togglePanel("columns")}>
          <AppIcon icon={TableColumnsSplitIcon} size={17} />
          Columns
        </button>
        {editable ? (
          <button
            type="button"
            className="ml-auto inline-flex h-10 items-center justify-center gap-2 border border-[#4FB8B2]/40 bg-[#123b36] px-4 text-sm font-medium text-[#7fe3dd] transition hover:bg-[#174b45]"
            onClick={onAddRecord}
          >
            <AppIcon icon={Add01Icon} size={17} />
            Add record
          </button>
        ) : null}
      </div>

      {activePanel ? (
        <div className="mb-3 border border-zinc-800 bg-zinc-950/70 p-3">
          {activePanel === "filters" ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={filterText}
                onChange={(event) => setFilterText(event.target.value)}
                placeholder="Filter records..."
                className="h-10 min-w-[260px] flex-1 border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-[#4FB8B2]/60"
              />
              {filterText ? (
                <button type="button" className={toolbarButton(false)} onClick={() => setFilterText("")}>
                  Clear
                </button>
              ) : null}
            </div>
          ) : null}

          {activePanel === "sort" ? (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={sortColumn}
                onChange={(event) => setSortColumn(event.target.value)}
                className="h-10 min-w-[220px] border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none focus:border-[#4FB8B2]/60"
              >
                <option value="">No sort</option>
                {columns.map((column) => (
                  <option key={column.name} value={column.name}>{column.name}</option>
                ))}
              </select>
              <button type="button" className={toolbarButton(sortDirection === "asc")} onClick={() => setSortDirection("asc")} disabled={!sortColumn}>
                <AppIcon icon={SortingUpIcon} size={16} />
                Asc
              </button>
              <button type="button" className={toolbarButton(sortDirection === "desc")} onClick={() => setSortDirection("desc")} disabled={!sortColumn}>
                <AppIcon icon={SortingDownIcon} size={16} />
                Desc
              </button>
            </div>
          ) : null}

          {activePanel === "columns" ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {columns.map((column) => {
                const visible = !hiddenColumns.has(column.name);
                return (
                  <label key={column.name} className="flex cursor-pointer items-center gap-2 border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-200">
                    <input
                      type="checkbox"
                      checked={visible}
                      onChange={() => toggleColumn(column.name)}
                      disabled={visible && visibleColumns.length === 1}
                      className="h-4 w-4 accent-[#4FB8B2]"
                    />
                    <span className="truncate">{column.name}</span>
                    <span className="ml-auto truncate font-mono text-[10px] text-zinc-500">{column.type}</span>
                  </label>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto border border-[#26323d] bg-[#090f12]">
        <table className="min-w-full border-collapse text-left font-mono text-sm">
          <thead className="sticky top-0 z-10 bg-[#0b1116] text-zinc-400">
            <tr>
              <th className="w-11 border-b border-r border-[#26323d] px-3 py-2">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleRows} className="h-4 w-4 accent-[#4FB8B2]" aria-label="Select visible records" />
              </th>
              {visibleColumns.map((column) => {
                const sorted = sortColumn === column.name;
                return (
                  <th key={column.name} className="min-w-[220px] border-b border-r border-[#26323d] px-4 py-3 font-semibold">
                    <button
                      type="button"
                      className="flex w-full min-w-0 items-center justify-between gap-3 text-left"
                      onClick={() => {
                        setSortColumn(column.name);
                        setSortDirection((current) => (sorted && current === "asc" ? "desc" : "asc"));
                      }}
                    >
                      <span className="min-w-0 truncate">
                        <span className="text-zinc-300">{column.name}</span>
                        <span className="ml-2 text-zinc-500">{column.type}</span>
                        {column.primaryKey ? <span className="ml-2 text-[#7fe3dd]">pk</span> : null}
                      </span>
                      <AppIcon icon={sorted ? (sortDirection === "asc" ? SortingUpIcon : SortingDownIcon) : Sorting05Icon} size={15} className={sorted ? "text-[#7fe3dd]" : "text-zinc-500"} />
                    </button>
                  </th>
                );
              })}
              {editable ? <th className="sticky right-0 w-28 border-b border-[#26323d] bg-[#0b1116] px-3 py-3 text-right text-zinc-500">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + (editable ? 2 : 1)} className="px-4 py-8 text-sm text-zinc-500">
                  {filterText ? "No records match this filter." : "No rows returned."}
                </td>
              </tr>
            ) : visibleRows.map(({ row, index }) => {
              const editing = editingIndex === index;
              const selected = selectedRows.has(index);
              return (
                <tr key={index} className={`group border-b border-[#26323d] ${selected ? "bg-[#4FB8B2]/10" : "odd:bg-[#090f12] even:bg-[#0d1519] hover:bg-[#162127]"}`}>
                  <td className="w-11 border-r border-[#26323d] px-3 py-3">
                    <input type="checkbox" checked={selected} onChange={() => toggleRow(index)} className="h-4 w-4 accent-[#4FB8B2]" aria-label={`Select record ${index + 1}`} />
                  </td>
                  {visibleColumns.map((column) => {
                    const value = row[column.name];
                    const empty = value === null || value === undefined;
                    return (
                      <td key={column.name} className="min-w-[220px] max-w-[320px] border-r border-[#26323d] px-4 py-3 align-middle text-zinc-200">
                        {editing ? (
                          <input
                            value={draftRow[column.name] ?? ""}
                            onChange={(event) => onDraftChange(column.name, event.target.value)}
                            className="h-9 w-full border border-zinc-700 bg-zinc-950 px-2 text-zinc-100 outline-none focus:border-[#4FB8B2]/60"
                          />
                        ) : (
                          <span className={`block truncate ${empty ? "text-zinc-600" : ""}`} title={displayValue(value)}>
                            {displayValue(value)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  {editable ? (
                    <td className="sticky right-0 w-28 bg-inherit px-3 py-3 text-right">
                      {editing ? (
                        <div className="flex justify-end gap-2">
                          <button type="button" className="text-[#7fe3dd]" onClick={() => onSaveEdit(row)} disabled={busy === "edit"}>Save</button>
                          <button type="button" className="text-zinc-400" onClick={onCancelEdit}>Cancel</button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2 opacity-70 transition group-hover:opacity-100">
                          <button type="button" className="text-zinc-400 hover:text-[#7fe3dd] disabled:opacity-40" onClick={() => onBeginEdit(index)} disabled={!hasPrimaryKey} aria-label="Edit row">
                            <AppIcon icon={PencilEdit02Icon} size={15} />
                          </button>
                          <button type="button" className="text-zinc-500 hover:text-rose-300 disabled:opacity-40" onClick={() => onDeleteRow(row)} disabled={!hasPrimaryKey} aria-label="Delete row">
                            <AppIcon icon={Delete02Icon} size={15} />
                          </button>
                        </div>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { Cancel01Icon, CheckmarkCircle02Icon, Delete02Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import type { DatabaseColumn, DatabaseRow } from "../../api";
import { AppIcon } from "../ui/primitives";

function columnType(columns: DatabaseColumn[], name: string) {
  return columns.find((column) => column.name === name)?.type ?? "text";
}

function documentKeys(columns: DatabaseColumn[], row: DatabaseRow) {
  const keys = new Set<string>();
  if ("_id" in row || columns.some((column) => column.name === "_id")) keys.add("_id");
  columns.forEach((column) => {
    if (column.name !== "_id") keys.add(column.name);
  });
  Object.keys(row).forEach((key) => {
    if (key !== "_id") keys.add(key);
  });
  return Array.from(keys);
}

function formatMongoValue(value: unknown, type: string) {
  if (value === null || value === undefined) return "null";
  if (type === "objectId" && typeof value === "string") return `ObjectId('${value}')`;
  if (typeof value === "string") {
    if (type === "date") return value;
    if (type === "array" || type === "object") return value;
    return `"${value}"`;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function valueClass(value: unknown, type: string) {
  if (value === null || value === undefined) return "text-zinc-600";
  if (type === "objectId") return "text-orange-400";
  if (type === "date") return "text-sky-400";
  if (type === "array" || type === "object") return "text-violet-300";
  if (typeof value === "number") return "text-amber-300";
  if (typeof value === "boolean") return "text-fuchsia-300";
  return "text-emerald-400";
}

function sourceValue(value: unknown, type: string) {
  if (value === null || value === undefined) return null;
  if (type === "objectId" && typeof value === "string" && /^[0-9a-fA-F]{24}$/.test(value)) return { $oid: value };
  if (type === "date" && typeof value === "string") return { $date: value };
  if ((type === "array" || type === "object") && typeof value === "string") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }
  return value;
}

export function mongoDocumentSource(columns: DatabaseColumn[], row: DatabaseRow) {
  const document: Record<string, unknown> = {};
  documentKeys(columns, row).forEach((key) => {
    if (row[key] !== undefined) document[key] = sourceValue(row[key], columnType(columns, key));
  });
  return JSON.stringify(document, null, 2);
}

function iconButtonClass(tone: "neutral" | "danger" | "success" = "neutral") {
  const toneClass = tone === "danger"
    ? "text-rose-300 hover:border-rose-500/40 hover:bg-rose-500/10"
    : tone === "success"
      ? "text-emerald-300 hover:border-emerald-500/40 hover:bg-emerald-500/10"
      : "text-zinc-400 hover:border-zinc-600 hover:bg-zinc-900 hover:text-zinc-100";
  return `grid h-8 w-8 place-items-center border border-zinc-800 bg-zinc-950 transition disabled:opacity-50 ${toneClass}`;
}

export function MongoDocumentCard({
  columns,
  row,
  busy,
  onEdit,
  onDelete
}: {
  columns: DatabaseColumn[];
  row: DatabaseRow;
  busy: string;
  onEdit: () => void;
  onDelete: () => Promise<void> | void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function confirmDelete() {
    try {
      await onDelete();
      setConfirmingDelete(false);
    } catch {
      // The parent panel surfaces the database error.
    }
  }

  return (
    <div className="relative border border-zinc-700 bg-zinc-950 px-4 py-4 pr-28 font-mono text-sm leading-6">
      <div className="absolute right-3 top-3 flex items-center gap-2">
        {confirmingDelete ? (
          <>
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Confirm delete?</span>
            <button type="button" className={iconButtonClass("success")} onClick={() => void confirmDelete()} disabled={busy === "delete"} title="Yes" aria-label="Confirm delete">
              <AppIcon icon={CheckmarkCircle02Icon} size={14} />
            </button>
            <button type="button" className={iconButtonClass()} onClick={() => setConfirmingDelete(false)} disabled={busy === "delete"} title="No" aria-label="Cancel delete">
              <AppIcon icon={Cancel01Icon} size={14} />
            </button>
          </>
        ) : (
          <>
            <button type="button" className={iconButtonClass()} onClick={onEdit} disabled={Boolean(busy)} title="Edit document" aria-label="Edit document">
              <AppIcon icon={PencilEdit02Icon} size={14} />
            </button>
            <button type="button" className={iconButtonClass("danger")} onClick={() => setConfirmingDelete(true)} disabled={Boolean(busy)} title="Delete document" aria-label="Delete document">
              <AppIcon icon={Delete02Icon} size={14} />
            </button>
          </>
        )}
      </div>

      {documentKeys(columns, row).map((key) => {
        const type = columnType(columns, key);
        const value = row[key];
        return (
          <div key={key} className="grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] gap-3">
            <div className="min-w-0 truncate text-zinc-100">{key}:</div>
            <div className={`min-w-0 truncate ${valueClass(value, type)}`} title={formatMongoValue(value, type)}>
              {formatMongoValue(value, type)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

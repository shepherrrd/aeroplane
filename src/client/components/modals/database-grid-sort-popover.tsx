import { SortingDownIcon, SortingUpIcon } from "@hugeicons/core-free-icons";
import type { DatabaseColumn } from "../../api";
import { AppIcon } from "../ui/primitives";
import type { GridSort, SortDirection } from "./database-grid-types";

function optionClass(active: boolean) {
  return `flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[13px] transition ${
    active ? "bg-zinc-800 text-zinc-50" : "text-zinc-300 hover:bg-zinc-900 hover:text-white"
  }`;
}

export function DatabaseGridSortPopover({
  columns,
  sort,
  onSortChange
}: {
  columns: DatabaseColumn[];
  sort: GridSort | null;
  onSortChange: (sort: GridSort | null) => void;
}) {
  const selectedColumn = sort?.column ?? "";
  const direction = sort?.direction ?? "asc";

  function setColumn(column: string) {
    onSortChange({ column, direction });
  }

  function setDirection(nextDirection: SortDirection) {
    if (!selectedColumn) return;
    onSortChange({ column: selectedColumn, direction: nextDirection });
  }

  return (
    <div className="absolute left-0 top-full z-30 mt-2 w-[320px] border border-zinc-700 bg-zinc-950 shadow-[0_22px_70px_rgba(0,0,0,0.45)]">
      <div className="border-b border-zinc-800 px-3 py-2.5">
        <div className="text-[13px] font-semibold text-zinc-100">Sort records</div>
        <div className="mt-1 text-xs text-zinc-500">Choose one column and direction.</div>
      </div>
      <div className="grid grid-cols-[1fr_104px] gap-2.5 p-2.5">
        <div className="min-w-0">
          <div className="mb-2 px-1 text-xs font-medium text-zinc-500">Column</div>
          <div className="max-h-64 overflow-y-auto border border-zinc-800 bg-zinc-950">
            {columns.map((column) => (
              <button key={column.name} type="button" className={optionClass(selectedColumn === column.name)} onClick={() => setColumn(column.name)}>
                <span className="truncate">{column.name}</span>
                <span className="ml-3 truncate font-mono text-[10px] text-zinc-500">{column.type}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 px-1 text-xs font-medium text-zinc-500">Direction</div>
          <div className="space-y-2">
            <button type="button" className={optionClass(Boolean(sort && direction === "asc"))} onClick={() => setDirection("asc")} disabled={!selectedColumn}>
              <span>Ascending</span>
              <AppIcon icon={SortingUpIcon} size={14} />
            </button>
            <button type="button" className={optionClass(Boolean(sort && direction === "desc"))} onClick={() => setDirection("desc")} disabled={!selectedColumn}>
              <span>Descending</span>
              <AppIcon icon={SortingDownIcon} size={14} />
            </button>
          </div>
        </div>
      </div>
      {sort ? (
        <div className="border-t border-zinc-800 p-2.5">
          <button type="button" className="text-[13px] text-zinc-400 hover:text-white" onClick={() => onSortChange(null)}>
            Clear sort
          </button>
        </div>
      ) : null}
    </div>
  );
}

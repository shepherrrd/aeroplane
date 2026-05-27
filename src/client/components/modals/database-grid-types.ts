import type { DatabaseColumn, DatabaseFilterOperator, DatabaseRow, DatabaseRowFilter } from "../../api";

export type SortDirection = "asc" | "desc";

export type GridSort = {
  column: string;
  direction: SortDirection;
};

export type FilterOperator = DatabaseFilterOperator;

export type GridFilter = DatabaseRowFilter & { id: string };

export type GridRowItem = {
  row: DatabaseRow;
  index: number;
};

export type EditingCell = {
  rowIndex: number;
  column: string;
} | null;

export const filterOperators: Array<{ value: FilterOperator; label: string; requiresValue: boolean }> = [
  { value: "equals", label: "equals", requiresValue: true },
  { value: "not_equals", label: "does not equal", requiresValue: true },
  { value: "contains", label: "contains", requiresValue: true },
  { value: "not_contains", label: "does not contain", requiresValue: true },
  { value: "starts_with", label: "starts with", requiresValue: true },
  { value: "ends_with", label: "ends with", requiresValue: true },
  { value: "is_empty", label: "is empty", requiresValue: false },
  { value: "is_not_empty", label: "is not empty", requiresValue: false },
  { value: "greater_than", label: "greater than", requiresValue: true },
  { value: "less_than", label: "less than", requiresValue: true }
];

export function createGridFilter(columns: DatabaseColumn[]): GridFilter {
  return {
    id: crypto.randomUUID(),
    column: columns[0]?.name ?? "",
    operator: "equals",
    value: ""
  };
}

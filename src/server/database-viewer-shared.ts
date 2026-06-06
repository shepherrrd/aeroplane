import { spawn } from "node:child_process";
import type { Service } from "./schema.js";

export type DatabaseTable = {
  id: string;
  schema: string;
  name: string;
  rowCount: number | null;
};

export type DatabaseSchema = {
  name: string;
};

export type DatabaseColumn = {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
};

export type CommandResult = {
  stdout: string;
  stderr: string;
};

export type DatabaseContext = {
  service: Service;
  dbType: string;
  envMap: Map<string, string>;
  containerName: string;
};

export type RowValue = null | boolean | number | string;
export type RowData = Record<string, RowValue>;

export type DatabaseFilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "is_empty"
  | "is_not_empty"
  | "greater_than"
  | "less_than";

export type DatabaseRowFilter = {
  column: string;
  operator: DatabaseFilterOperator;
  value: string;
};

export const valueFilterOperators = new Set<DatabaseFilterOperator>([
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "greater_than",
  "less_than"
]);

function commandError(stderr: string, stdout: string) {
  return (stderr || stdout || "Database command failed").trim();
}

export function runDockerExec(containerName: string, command: string[], env: Record<string, string> = {}) {
  return new Promise<CommandResult>((resolvePromise, reject) => {
    const envArgs = Object.entries(env).flatMap(([key, value]) => ["-e", `${key}=${value}`]);
    const child = spawn("docker", ["exec", ...envArgs, containerName, ...command], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
      } else {
        reject(new Error(commandError(stderr, stdout)));
      }
    });
  });
}

export function activeFiltersForColumns(filters: DatabaseRowFilter[], columns: DatabaseColumn[]) {
  const columnNames = new Set(columns.map((column) => column.name));
  return filters
    .filter((filter) => columnNames.has(filter.column))
    .filter((filter) => !valueFilterOperators.has(filter.operator) || filter.value.trim())
    .slice(0, 12);
}

function displayValue(value: RowValue | undefined) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function isEmptyValue(value: RowValue | undefined) {
  return value === null || value === undefined || value === "";
}

function numericCompare(left: RowValue | undefined, right: string, operator: DatabaseFilterOperator) {
  const leftNumber = typeof left === "number" ? left : Number(left);
  const rightNumber = Number(right);
  if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) return false;
  return operator === "greater_than" ? leftNumber > rightNumber : leftNumber < rightNumber;
}

function matchesFilter(row: RowData, filter: DatabaseRowFilter) {
  const value = row[filter.column];
  const text = displayValue(value).toLowerCase();
  const target = filter.value.toLowerCase();

  if (filter.operator === "is_empty") return isEmptyValue(value);
  if (filter.operator === "is_not_empty") return !isEmptyValue(value);
  if (!filter.value) return true;
  if (filter.operator === "equals") return text === target;
  if (filter.operator === "not_equals") return text !== target;
  if (filter.operator === "contains") return text.includes(target);
  if (filter.operator === "not_contains") return !text.includes(target);
  if (filter.operator === "starts_with") return text.startsWith(target);
  if (filter.operator === "ends_with") return text.endsWith(target);
  if (filter.operator === "greater_than" || filter.operator === "less_than") return numericCompare(value, filter.value, filter.operator);
  return true;
}

export function filterRowsInMemory(rows: RowData[], columns: DatabaseColumn[], filters: DatabaseRowFilter[]) {
  const activeFilters = activeFiltersForColumns(filters, columns);
  if (activeFilters.length === 0) return rows;
  return rows.filter((row) => activeFilters.every((filter) => matchesFilter(row, filter)));
}

export function paginateRows(rows: RowData[], limit: number, offset: number) {
  return rows.slice(offset, offset + limit);
}

export function inferColumnType(value: RowValue | undefined) {
  if (value === null || value === undefined) return "unknown";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return "text";
}

export function columnsFromRows(rows: RowData[], preferredNames: string[] = []) {
  const names = new Set(preferredNames);
  for (const row of rows) {
    for (const name of Object.keys(row)) names.add(name);
  }

  return Array.from(names).map((name) => {
    const sample = rows.find((row) => row[name] !== null && row[name] !== undefined)?.[name];
    return {
      name,
      type: inferColumnType(sample),
      nullable: true,
      primaryKey: false
    };
  });
}

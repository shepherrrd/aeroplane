import { AddSquareIcon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useMemo, useState } from "react";
import { AppIcon, FormInput, shellButton } from "../../components/ui/primitives";

export type EnvironmentVariableSuggestionItem = {
  id: string;
  key: string;
  value: string;
  label: string;
  context: string;
};

export type EnvironmentVariableSuggestionGroup = {
  id: "database" | "env-example";
  title: string;
  suggestions: EnvironmentVariableSuggestionItem[];
};

type SuggestedEnvRow = {
  id: string;
  key: string;
  value: string;
};

function promptForGroups(groups: EnvironmentVariableSuggestionGroup[]) {
  const hasDatabase = groups.some((group) => group.id === "database" && group.suggestions.length > 0);
  const hasEnvExample = groups.some((group) => group.id === "env-example" && group.suggestions.length > 0);

  if (hasDatabase && hasEnvExample) return "We found these variables in your source code and project services";
  if (hasEnvExample) return "We found these variables in your source code";
  return "We found these variables from your project services";
}

export function EnvironmentVariableSuggestions({
  groups,
  onAdd
}: {
  groups: EnvironmentVariableSuggestionGroup[];
  onAdd: (entries: Array<{ key: string; value: string }>) => void;
}) {
  const suggestions = useMemo(() => groups.flatMap((group) => group.suggestions), [groups]);
  const suggestionSignature = useMemo(() => suggestions.map((suggestion) => `${suggestion.id}:${suggestion.key}:${suggestion.value}`).join("|"), [suggestions]);
  const [rows, setRows] = useState<SuggestedEnvRow[]>([]);

  useEffect(() => {
    setRows(suggestions.map((suggestion) => ({
      id: suggestion.id,
      key: suggestion.key,
      value: suggestion.value
    })));
  }, [suggestionSignature, suggestions]);

  if (suggestions.length === 0) return null;

  function updateRow(id: string, patch: Partial<SuggestedEnvRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeRow(id: string) {
    setRows((current) => current.filter((row) => row.id !== id));
  }

  function addRows() {
    const entries = rows
      .map((row) => ({ key: row.key.trim(), value: row.value }))
      .filter((row) => row.key.length > 0);
    if (entries.length === 0) return;
    onAdd(entries);
  }

  return (
    <div className="space-y-3 border border-zinc-800 bg-zinc-950/45 p-3">
      <div className="text-sm text-zinc-400">{promptForGroups(groups)}</div>
      <div className="space-y-2">
        {rows.length === 0 ? (
          <div className="border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm text-zinc-500">No suggested variables selected.</div>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="grid gap-2 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.8fr)_32px] lg:items-center">
              <FormInput
                value={row.key}
                onChange={(event) => updateRow(row.id, { key: event.target.value })}
                placeholder="KEY"
                autoComplete="off"
                className="h-9 font-mono text-xs uppercase tracking-[0.04em]"
              />
              <FormInput
                value={row.value}
                onChange={(event) => updateRow(row.id, { value: event.target.value })}
                placeholder="VALUE"
                autoComplete="new-password"
                className="h-9 font-mono text-xs"
              />
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center text-zinc-500 transition hover:bg-zinc-900 hover:text-zinc-100"
                onClick={() => removeRow(row.id)}
                aria-label={`Remove ${row.key || "suggested variable"}`}
              >
                <AppIcon icon={Cancel01Icon} size={14} />
              </button>
            </div>
          ))
        )}
      </div>
      <div className="flex justify-end">
        <button type="button" className={shellButton("primary")} onClick={addRows} disabled={rows.length === 0}>
          <AppIcon icon={AddSquareIcon} size={15} />
          Add
        </button>
      </div>
    </div>
  );
}

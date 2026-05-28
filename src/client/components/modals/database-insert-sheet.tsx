import type { FormEvent } from "react";
import type { DatabaseColumn } from "../../api";
import { Dropdown } from "../ui/dropdown";
import { FieldLabel, FormInput, shellButton } from "../ui/primitives";

const redisTypeOptions = [
  { value: "string", label: "String" },
  { value: "hash", label: "Hash" },
  { value: "list", label: "List" },
  { value: "set", label: "Set" },
  { value: "zset", label: "Sorted set" }
];

export function validRedisType(value: string) {
  return redisTypeOptions.some((option) => option.value === value);
}

export function DatabaseInsertSheet({
  engine,
  title,
  subtitle,
  buttonLabel,
  columns,
  draft,
  error,
  busy,
  onDraftChange,
  onClose,
  onSubmit
}: {
  engine: string;
  title: string;
  subtitle: string;
  buttonLabel: string;
  columns: DatabaseColumn[];
  draft: Record<string, string>;
  error: string;
  busy: string;
  onDraftChange: (draft: Record<string, string>) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const isRedis = engine === "redis";
  const isMongo = engine === "mongodb" || engine === "mongo";

  return (
    <div className="fixed bottom-4 right-4 top-4 z-[60] w-full max-w-md border-l border-zinc-700 bg-zinc-950 shadow-[-24px_0_60px_rgba(0,0,0,0.35)]">
      <form onSubmit={onSubmit} className="flex h-full flex-col">
        <div className="border-b border-zinc-800 px-5 py-4">
          <div className="font-hero text-lg text-zinc-100">{title}</div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">{subtitle}</div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <div className="mb-4 border border-rose-500/30 bg-rose-950/25 px-4 py-3 text-sm text-rose-200">{error}</div>
          ) : null}
          {isRedis ? (
            <div className="space-y-4">
              <label className="block">
                <FieldLabel>Key</FieldLabel>
                <FormInput value={draft.key ?? ""} onChange={(event) => onDraftChange({ ...draft, key: event.target.value })} placeholder="session:example" required />
              </label>
              <label className="block">
                <FieldLabel>Type</FieldLabel>
                <Dropdown value={draft.type ?? "string"} options={redisTypeOptions} onChange={(type) => onDraftChange({ ...draft, type })} />
              </label>
              {draft.type === "hash" ? (
                <label className="block">
                  <FieldLabel>Field</FieldLabel>
                  <FormInput value={draft.field ?? ""} onChange={(event) => onDraftChange({ ...draft, field: event.target.value })} placeholder="name" required />
                </label>
              ) : null}
              {draft.type === "zset" ? (
                <>
                  <label className="block">
                    <FieldLabel>Member</FieldLabel>
                    <FormInput value={draft.member ?? ""} onChange={(event) => onDraftChange({ ...draft, member: event.target.value })} placeholder="member" required />
                  </label>
                  <label className="block">
                    <FieldLabel>Score</FieldLabel>
                    <FormInput value={draft.score ?? ""} onChange={(event) => onDraftChange({ ...draft, score: event.target.value })} placeholder="0" />
                  </label>
                </>
              ) : (
                <label className="block">
                  <FieldLabel>Value</FieldLabel>
                  <FormInput value={draft.value ?? ""} onChange={(event) => onDraftChange({ ...draft, value: event.target.value })} placeholder="value" />
                </label>
              )}
              <label className="block">
                <FieldLabel>TTL seconds</FieldLabel>
                <FormInput value={draft.ttl ?? ""} onChange={(event) => onDraftChange({ ...draft, ttl: event.target.value })} placeholder="Optional" />
              </label>
            </div>
          ) : isMongo ? (
            <div className="space-y-4">
              <label className="block">
                <FieldLabel>Database</FieldLabel>
                <FormInput value={draft.database ?? ""} onChange={(event) => onDraftChange({ ...draft, database: event.target.value })} placeholder="aeroplane" required />
              </label>
              <label className="block">
                <FieldLabel>Collection</FieldLabel>
                <FormInput value={draft.collection ?? ""} onChange={(event) => onDraftChange({ ...draft, collection: event.target.value })} placeholder="users" required />
              </label>
              <label className="block">
                <FieldLabel>Document JSON</FieldLabel>
                <textarea
                  value={draft.document ?? ""}
                  onChange={(event) => onDraftChange({ ...draft, document: event.target.value })}
                  className="min-h-56 w-full resize-none border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 outline-none transition focus:border-[#4FB8B2]"
                  spellCheck={false}
                />
              </label>
            </div>
          ) : (
            <div className="space-y-4">
              {columns.map((column) => (
                <label key={column.name} className="block">
                  <FieldLabel>{column.name}</FieldLabel>
                  <FormInput value={draft[column.name] ?? ""} onChange={(event) => onDraftChange({ ...draft, [column.name]: event.target.value })} placeholder={column.type} />
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-zinc-800 px-5 py-4">
          <button type="button" className={shellButton("ghost")} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={shellButton("primary")} disabled={busy === "insert"}>
            {buttonLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

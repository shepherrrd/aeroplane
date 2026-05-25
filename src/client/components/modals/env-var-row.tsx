import { useState, useEffect } from "react";
import {
  EyeIcon,
  EyeOff,
  CopyIcon,
  CopyCheckIcon,
  PencilEdit02Icon,
  Delete02Icon,
  CheckmarkCircle02Icon,
  Cancel01Icon
} from "@hugeicons/core-free-icons";
import { AppIcon, FormInput, shellButton } from "../ui/primitives";
import { AutocompleteInput } from "../ui/autocomplete-input";
import type { EnvVar } from "../../api";

interface EnvVarRowProps {
  item: EnvVar;
  onSave: (key: string, value: string) => Promise<void>;
  onDelete: () => Promise<void>;
  busy: boolean;
  suggestions: Array<{ key: string; label: string }>;
}

export function EnvVarRow({ item, onSave, onDelete, busy, suggestions }: EnvVarRowProps) {
  const [editing, setEditing] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [copied, setCopied] = useState(false);
  const [editKey, setEditKey] = useState(item.key);
  const [editValue, setEditValue] = useState(item.value ?? "");

  // Keep in sync with changes from upstream
  useEffect(() => {
    setEditKey(item.key);
    setEditValue(item.value ?? "");
  }, [item]);

  async function handleCopy() {
    if (!item.value) return;
    try {
      await navigator.clipboard.writeText(item.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editKey.trim() || !editValue) return;
    try {
      await onSave(editKey.trim(), editValue);
      setEditing(false);
    } catch (err) {
      console.error("Failed to save env var:", err);
    }
  }

  const hasReference = !!(item.resolvedValue && item.resolvedValue !== item.value);

  if (editing) {
    return (
      <div className="border-b border-zinc-800 bg-zinc-900/40 px-5 py-3 transition-colors duration-200 flex flex-col gap-2 w-full">
        <form
          onSubmit={handleSave}
          className="grid grid-cols-[1fr_1fr_auto] items-center gap-3 w-full"
        >
          <div>
            <FormInput
              value={editKey}
              onChange={(e) => setEditKey(e.target.value)}
              placeholder="KEY"
              autoComplete="off"
              required
              disabled={busy}
              className="font-mono uppercase tracking-[0.06em] h-9 text-xs focus:border-[#4FB8B2]"
            />
          </div>
          <div className="relative flex items-center">
            <AutocompleteInput
              type={hidden ? "password" : "text"}
              value={editValue}
              onChange={(val) => setEditValue(val)}
              suggestions={suggestions}
              placeholder="VALUE"
              autoComplete="off"
              required
              disabled={busy}
              className="font-mono h-9 text-xs pr-9 focus:border-[#4FB8B2]"
            />
            <button
              type="button"
              className="absolute right-2 text-zinc-500 hover:text-zinc-300 transition-colors"
              onClick={() => setHidden(!hidden)}
              disabled={busy}
            >
              <AppIcon icon={hidden ? EyeIcon : EyeOff} size={15} />
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="submit"
              className="inline-flex h-9 items-center justify-center border border-zinc-700 bg-emerald-950/20 text-emerald-400 hover:bg-emerald-950/40 hover:text-emerald-300 px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] transition disabled:opacity-60"
              disabled={busy}
              title="Save"
            >
              <AppIcon icon={CheckmarkCircle02Icon} size={14} className="mr-1" />
              Save
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center border border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] transition disabled:opacity-60"
              onClick={() => {
                setEditKey(item.key);
                setEditValue(item.value ?? "");
                setEditing(false);
              }}
              disabled={busy}
              title="Cancel"
            >
              <AppIcon icon={Cancel01Icon} size={14} className="mr-1" />
              Cancel
            </button>
          </div>
        </form>
        {hasReference && (
          <div className="ml-1 flex items-center gap-2 text-[11px] text-zinc-400 font-mono select-none">
            <span className="inline-flex items-center gap-1 rounded bg-[#4FB8B2]/10 border border-[#4FB8B2]/20 px-1.5 py-0.5 text-[#4FB8B2] font-semibold text-[9px] uppercase tracking-[0.08em]">
              Reference
            </span>
            <span className="text-zinc-500">→ resolves to:</span>
            <span className={`font-semibold text-zinc-300 ${hidden ? "select-none tracking-widest text-zinc-500/80 font-sans" : "select-all"}`}>
              {hidden ? "••••••••••••••••" : item.resolvedValue}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border-b border-zinc-800 last:border-b-0 px-5 py-4 bg-zinc-900/10 hover:bg-zinc-900/30 transition-colors duration-200 flex flex-col gap-2 w-full">
      <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-4 w-full">
        <div className="flex min-w-0 items-center gap-4">
          <span className="font-mono text-lg text-zinc-500">{`{ }`}</span>
          <span className="truncate font-mono text-[15px] uppercase tracking-[0.06em] text-zinc-100 font-medium">
            {item.key}
          </span>
        </div>

        <div className="relative flex items-center">
          <FormInput
            type={hidden ? "password" : "text"}
            value={item.value ?? ""}
            readOnly
            className="font-mono text-xs h-9 bg-zinc-950/30 border-zinc-800/80 cursor-text select-all pr-9 focus:border-zinc-700/80"
          />
          <button
            type="button"
            className="absolute right-2 text-zinc-500 hover:text-zinc-300 transition-colors"
            onClick={() => setHidden(!hidden)}
            disabled={busy}
            title={hidden ? "Show Value" : "Hide Value"}
          >
            <AppIcon icon={hidden ? EyeIcon : EyeOff} size={15} />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            className={`inline-flex h-8 w-8 items-center justify-center border transition duration-150 ${
              copied
                ? "border-[#4FB8B2]/40 bg-[#4FB8B2]/10 text-[#4FB8B2]"
                : "border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100"
            }`}
            onClick={handleCopy}
            title={copied ? "Copied!" : "Copy Value"}
            disabled={busy || !item.value}
          >
            <AppIcon icon={copied ? CopyCheckIcon : CopyIcon} size={15} />
          </button>

          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center border border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100 transition duration-150"
            onClick={() => {
              setHidden(false);
              setEditing(true);
            }}
            title="Edit"
            disabled={busy}
          >
            <AppIcon icon={PencilEdit02Icon} size={15} />
          </button>

          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center border border-zinc-800 text-zinc-400 hover:border-rose-500/35 hover:bg-rose-500/10 hover:text-rose-300 transition duration-150"
            onClick={() => {
              if (window.confirm(`Delete variable "${item.key}"?`)) {
                void onDelete();
              }
            }}
            title="Delete"
            disabled={busy}
          >
            <AppIcon icon={Delete02Icon} size={15} />
          </button>
        </div>
      </div>
      {hasReference && (
        <div className="ml-10 flex items-center gap-2 text-[11px] text-zinc-400 font-mono select-none">
          <span className="inline-flex items-center gap-1 rounded bg-[#4FB8B2]/10 border border-[#4FB8B2]/20 px-1.5 py-0.5 text-[#4FB8B2] font-semibold text-[9px] uppercase tracking-[0.08em]">
            Reference
          </span>
          <span className="text-zinc-500">→ resolves to:</span>
          <span className={`font-semibold text-zinc-300 ${hidden ? "select-none tracking-widest text-zinc-500/80 font-sans" : "select-all"}`}>
            {hidden ? "••••••••••••••••" : item.resolvedValue}
          </span>
        </div>
      )}
    </div>
  );
}

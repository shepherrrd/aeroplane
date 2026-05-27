import { useMemo, useRef } from "react";

const sqlKeywords = new Set([
  "add",
  "alter",
  "and",
  "as",
  "asc",
  "by",
  "create",
  "delete",
  "desc",
  "drop",
  "from",
  "group",
  "having",
  "insert",
  "into",
  "join",
  "left",
  "limit",
  "not",
  "null",
  "offset",
  "on",
  "or",
  "order",
  "outer",
  "right",
  "select",
  "set",
  "table",
  "update",
  "values",
  "where",
  "with"
]);

function highlightedSql(sql: string) {
  const tokens = sql.split(/('(?:''|[^'])*'|"(?:\\"|[^"])*"|--[^\n]*|\b[A-Za-z_][A-Za-z0-9_]*\b|\s+|.)/g).filter(Boolean);
  return tokens.map((token, index) => {
    const lower = token.toLowerCase();
    if (token.startsWith("--")) {
      return <span key={index} className="text-zinc-500">{token}</span>;
    }
    if (token.startsWith("'") || token.startsWith("\"")) {
      return <span key={index} className="text-emerald-300">{token}</span>;
    }
    if (sqlKeywords.has(lower)) {
      return <span key={index} className="text-[#7fe3dd]">{token}</span>;
    }
    if (/^\d+(\.\d+)?$/.test(token)) {
      return <span key={index} className="text-amber-300">{token}</span>;
    }
    return <span key={index}>{token}</span>;
  });
}

export function SqlEditor({
  value,
  onChange,
  disabled = false
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const highlighted = useMemo(() => highlightedSql(value || " "), [value]);
  const highlightRef = useRef<HTMLPreElement | null>(null);

  return (
    <div className="relative min-h-[180px] overflow-hidden border border-zinc-700 bg-zinc-950">
      <pre
        ref={highlightRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-sm leading-6 text-zinc-200"
      >
        {highlighted}
      </pre>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        disabled={disabled}
        onScroll={(event) => {
          if (!highlightRef.current) return;
          highlightRef.current.scrollTop = event.currentTarget.scrollTop;
          highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
        }}
        className="relative h-[180px] w-full resize-none overflow-auto border-0 bg-transparent p-4 font-mono text-sm leading-6 text-transparent caret-[#7fe3dd] outline-none selection:bg-[#4FB8B2]/30 disabled:opacity-60"
      />
    </div>
  );
}

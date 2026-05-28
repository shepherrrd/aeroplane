import { ArrowDown01Icon, Cancel01Icon, Clock01Icon, Search01Icon, StarIcon } from "@hugeicons/core-free-icons";
import { acceptCompletion, autocompletion, type CompletionContext } from "@codemirror/autocomplete";
import { javascript } from "@codemirror/lang-javascript";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Prec } from "@codemirror/state";
import { keymap, EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import CodeMirror from "@uiw/react-codemirror";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DatabaseRowFilter } from "../../api";
import { AppIcon } from "../ui/primitives";
import { mongoQuerySyntaxError, mongoQueryToFilters } from "./mongo-query-utils";

type StoredQuery = {
  text: string;
  savedAt: string;
};

type QueryTab = "recents" | "favorites";

function storageKey(scopeLabel: string, kind: QueryTab) {
  return `aeroplane:mongo:${kind}:${scopeLabel}`;
}

function readStoredQueries(scopeLabel: string, kind: QueryTab) {
  try {
    const raw = window.localStorage.getItem(storageKey(scopeLabel, kind));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed
          .filter((item): item is StoredQuery => Boolean(item?.text) && typeof item.text === "string")
          .slice(0, 24)
      : [];
  } catch {
    return [];
  }
}

function writeStoredQueries(scopeLabel: string, kind: QueryTab, queries: StoredQuery[]) {
  window.localStorage.setItem(storageKey(scopeLabel, kind), JSON.stringify(queries.slice(0, 24)));
}

function upsertQuery(queries: StoredQuery[], text: string) {
  const trimmed = text.trim();
  if (!trimmed) return queries;
  return [{ text: trimmed, savedAt: new Date().toISOString() }, ...queries.filter((item) => item.text !== trimmed)].slice(0, 24);
}

function highlightedSuggestion(text: string, needle: string) {
  const index = text.toLowerCase().indexOf(needle.toLowerCase());
  if (!needle || index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <span className="text-[#7fe3dd]">{text.slice(index, index + needle.length)}</span>
      {text.slice(index + needle.length)}
    </>
  );
}

const mongoQueryBasicSetup = {
  lineNumbers: false,
  foldGutter: false,
  highlightActiveLine: false,
  highlightActiveLineGutter: false,
  autocompletion: false,
  searchKeymap: false,
  foldKeymap: false,
  completionKeymap: true
};

const mongoQueryHighlightStyle = HighlightStyle.define([
  { tag: tags.string, color: "#34d399" },
  { tag: [tags.number, tags.bool, tags.null], color: "#f59e0b" },
  { tag: tags.propertyName, color: "#f4f4f5" },
  { tag: tags.keyword, color: "#e879f9" },
  { tag: tags.punctuation, color: "#71717a" }
]);

const mongoQueryEditorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "#09090b",
      color: "#f4f4f5",
      fontSize: "14px"
    },
    ".cm-editor": {
      backgroundColor: "#09090b"
    },
    "&.cm-focused": {
      outline: "none"
    },
    ".cm-scroller": {
      backgroundColor: "#09090b",
      overflow: "auto hidden",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    },
    ".cm-content": {
      backgroundColor: "#09090b",
      minHeight: "42px",
      padding: "0 16px",
      lineHeight: "42px",
      caretColor: "#f4f4f5"
    },
    ".cm-line": {
      padding: "0"
    },
    ".cm-cursor": {
      borderLeftColor: "#f4f4f5"
    },
    ".cm-placeholder": {
      color: "#71717a"
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "rgba(79, 184, 178, 0.22)"
    },
    ".cm-activeLine": {
      backgroundColor: "transparent"
    },
    ".cm-gutters": {
      display: "none"
    },
    ".cm-tooltip": {
      border: "1px solid #3f3f46",
      backgroundColor: "#09090b",
      color: "#d4d4d8"
    },
    ".cm-tooltip-autocomplete ul li": {
      padding: "6px 8px",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: "12px"
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      backgroundColor: "rgba(79, 184, 178, 0.16)",
      color: "#7fe3dd"
    },
    ".cm-completionDetail": {
      color: "#71717a",
      marginLeft: "12px"
    }
  },
  { dark: true }
);

export function MongoQueryBar({
  scopeLabel,
  query,
  busy,
  onQueryChange,
  onFind,
  onClear
}: {
  scopeLabel: string;
  query: string;
  busy: string;
  onQueryChange: (value: string) => void;
  onFind: (filters: DatabaseRowFilter[], source: string) => void;
  onClear: () => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<QueryTab>("recents");
  const [recents, setRecents] = useState<StoredQuery[]>([]);
  const [favorites, setFavorites] = useState<StoredQuery[]>([]);
  const syntaxError = mongoQuerySyntaxError(query);
  const trimmedQuery = query.trim();
  const favoriteTexts = useMemo(() => new Set(favorites.map((item) => item.text)), [favorites]);
  const completionQueries = useMemo(() => {
    const search = trimmedQuery.toLowerCase();
    const combined = [...favorites, ...recents].filter((item, index, items) => items.findIndex((candidate) => candidate.text === item.text) === index);
    return (search ? combined.filter((item) => item.text.toLowerCase().includes(search)) : combined).slice(0, 24);
  }, [favorites, recents, trimmedQuery]);

  useEffect(() => {
    setRecents(readStoredQueries(scopeLabel, "recents"));
    setFavorites(readStoredQueries(scopeLabel, "favorites"));
    setMenuOpen(false);
  }, [scopeLabel]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function saveRecents(next: StoredQuery[]) {
    setRecents(next);
    writeStoredQueries(scopeLabel, "recents", next);
  }

  function saveFavorites(next: StoredQuery[]) {
    setFavorites(next);
    writeStoredQueries(scopeLabel, "favorites", next);
  }

  function runFind(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (syntaxError || busy === "rows") return;
    if (trimmedQuery) saveRecents(upsertQuery(recents, trimmedQuery));
    onFind(mongoQueryToFilters(trimmedQuery), trimmedQuery);
  }

  function selectQuery(text: string) {
    onQueryChange(text);
    setMenuOpen(false);
  }

  function toggleFavorite(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (favoriteTexts.has(trimmed)) {
      saveFavorites(favorites.filter((item) => item.text !== trimmed));
    } else {
      saveFavorites(upsertQuery(favorites, trimmed));
    }
  }

  const listedQueries = activeTab === "recents" ? recents : favorites;
  const editorExtensions = [
    javascript(),
    syntaxHighlighting(mongoQueryHighlightStyle),
    autocompletion({
      activateOnTyping: true,
      override: [
        (context: CompletionContext) => {
          const text = context.state.doc.toString().trim().toLowerCase();
          if (!context.explicit && !text) return null;
          const options = completionQueries
            .filter((item) => !text || item.text.toLowerCase().includes(text))
            .slice(0, 8)
            .map((item) => ({
              label: item.text,
              type: "text",
              detail: favoriteTexts.has(item.text) ? "favorite" : "recent",
              apply: item.text
            }));
          if (options.length === 0) return null;
          return { from: 0, to: context.state.doc.length, options, validFor: /.*/ };
        }
      ]
    }),
    Prec.highest(keymap.of([
      {
        key: "Enter",
        run: (view) => {
          if (acceptCompletion(view)) return true;
          runFind();
          return true;
        }
      }
    ])),
    EditorView.contentAttributes.of({
      autocapitalize: "off",
      autocomplete: "off",
      autocorrect: "off",
      spellcheck: "false"
    }),
    mongoQueryEditorTheme
  ];

  return (
    <div ref={rootRef} className="relative mb-3">
      <form
        className={`flex h-11 items-center border bg-zinc-950 text-zinc-100 ${
          syntaxError ? "border-rose-500/70" : "border-zinc-700"
        }`}
        onSubmit={runFind}
      >
        <button
          type="button"
          className="flex h-full items-center gap-2 border-r border-zinc-800 px-3 text-zinc-100 transition hover:bg-zinc-900"
          onClick={() => {
            setActiveTab("recents");
            setMenuOpen((current) => !current);
          }}
          aria-label="Recent queries"
          aria-expanded={menuOpen}
        >
          <AppIcon icon={Clock01Icon} size={16} />
          <AppIcon icon={ArrowDown01Icon} size={13} className={`text-zinc-300 transition ${menuOpen ? "rotate-180" : ""}`} />
        </button>

        <div className="h-full min-w-0 flex-1 overflow-hidden bg-zinc-950">
          <CodeMirror
            value={query}
            height="42px"
            basicSetup={mongoQueryBasicSetup}
            extensions={editorExtensions}
            onChange={onQueryChange}
            placeholder="Type a query: { field: 'value' }"
            theme="dark"
            className="h-full bg-zinc-950 [&_.cm-content]:bg-zinc-950 [&_.cm-editor]:bg-zinc-950 [&_.cm-scroller]:bg-zinc-950"
          />
        </div>

        {trimmedQuery ? (
          <>
            <button
              type="button"
              className={`mr-2 inline-flex h-7 w-7 items-center justify-center border transition ${
                favoriteTexts.has(trimmedQuery)
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                  : "border-zinc-700 bg-zinc-900/80 text-zinc-400 hover:border-zinc-500 hover:text-white"
              }`}
              onClick={() => toggleFavorite(trimmedQuery)}
              title={favoriteTexts.has(trimmedQuery) ? "Remove favorite" : "Save favorite"}
              aria-label={favoriteTexts.has(trimmedQuery) ? "Remove favorite" : "Save favorite"}
            >
              <AppIcon icon={StarIcon} size={14} />
            </button>
            <button
              type="button"
              className="mr-2 inline-flex h-7 items-center gap-1.5 border border-zinc-700 bg-zinc-900/80 px-2.5 text-xs text-zinc-300 transition hover:border-zinc-500 hover:text-white"
              onClick={onClear}
              disabled={busy === "rows"}
            >
              <AppIcon icon={Cancel01Icon} size={13} />
              Clear
            </button>
          </>
        ) : null}

        <button
          type="submit"
          className="mr-2 inline-flex h-7 items-center gap-1.5 border border-[#4FB8B2]/45 bg-[#4FB8B2]/15 px-2.5 text-xs font-medium text-[#7fe3dd] transition hover:bg-[#4FB8B2]/25 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={Boolean(syntaxError) || busy === "rows"}
        >
          <AppIcon icon={Search01Icon} size={13} />
          Find
        </button>
      </form>

      {syntaxError ? <div className="mt-1 font-mono text-[10px] text-rose-300">{syntaxError}</div> : null}

      {menuOpen ? (
        <div className="absolute left-0 top-full z-50 mt-2 w-[460px] border border-zinc-700 bg-zinc-950 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          <div className="font-hero text-lg text-zinc-100">Queries in {scopeLabel}</div>
          <div className="mt-4 inline-flex border border-zinc-700 bg-zinc-950 p-1">
            {(["recents", "favorites"] as QueryTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`inline-flex h-8 items-center gap-2 px-3 text-sm font-semibold capitalize transition ${
                  activeTab === tab ? "bg-zinc-100 text-zinc-950" : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                }`}
                onClick={() => setActiveTab(tab)}
              >
                <AppIcon icon={tab === "recents" ? Clock01Icon : StarIcon} size={15} />
                {tab}
              </button>
            ))}
          </div>

          <div className="mt-4 max-h-64 overflow-y-auto">
            {listedQueries.length === 0 ? (
              <div className="flex min-h-40 items-center justify-center border border-zinc-800 bg-zinc-950/70 px-5 text-center text-sm text-zinc-500">
                {activeTab === "recents" ? "Your recent queries will appear here." : "Saved favorite queries will appear here."}
              </div>
            ) : listedQueries.map((item) => (
              <div key={item.text} className="group flex items-center gap-2 border-b border-zinc-900 py-2 last:border-b-0">
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate px-2 py-1.5 text-left font-mono text-xs text-zinc-300 transition group-hover:bg-zinc-900 group-hover:text-white"
                  onClick={() => selectQuery(item.text)}
                >
                  {item.text}
                </button>
                <button
                  type="button"
                  className={`inline-flex h-7 w-7 items-center justify-center border transition ${
                    favoriteTexts.has(item.text)
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                      : "border-zinc-800 bg-zinc-900/70 text-zinc-500 hover:border-zinc-600 hover:text-zinc-200"
                  }`}
                  onClick={() => toggleFavorite(item.text)}
                  title={favoriteTexts.has(item.text) ? "Remove favorite" : "Save favorite"}
                  aria-label={favoriteTexts.has(item.text) ? "Remove favorite" : "Save favorite"}
                >
                  <AppIcon icon={StarIcon} size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

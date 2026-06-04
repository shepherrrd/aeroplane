import { GithubIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { useMemo } from "react";
import type { GitHubRepo } from "../../api";
import { compareReposByLastPush } from "../../lib/github-repos";
import { ModalShell } from "./modal-shell";
import { AppIcon, FormInput, shellButton } from "../ui/primitives";

type SourcePickerModalProps = {
  open: boolean;
  query: string;
  repos: GitHubRepo[];
  loading: boolean;
  error: string;
  onClose: () => void;
  onQueryChange: (value: string) => void;
  onSelect: (repo: GitHubRepo) => void;
};

export function SourcePickerModal({ open, query, repos, loading, error, onClose, onQueryChange, onSelect }: SourcePickerModalProps) {
  const sortedRepos = useMemo(() => [...repos].sort(compareReposByLastPush), [repos]);

  return (
    <ModalShell open={open} onClose={onClose} icon={GithubIcon} title="Change source" meta="Choose a different GitHub repository." width="max-w-3xl">
      <div className="space-y-4">
        <div className="relative">
          <AppIcon icon={Search01Icon} size={16} className="pointer-events-none absolute left-3 top-3 text-zinc-500" />
          <FormInput value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search repositories" className="pl-10" />
        </div>

        {error ? <div className="border border-rose-500/25 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

        <div className="max-h-[420px] overflow-auto border border-zinc-700 bg-zinc-900/88">
          {repos.length === 0 ? (
            <div className="px-4 py-5 text-sm text-zinc-400">{loading ? "Loading repositories..." : "No repositories found."}</div>
          ) : (
            sortedRepos.map((repo) => (
              <button
                key={repo.id}
                type="button"
                className="flex w-full items-center justify-between gap-4 border-b border-zinc-800 px-4 py-4 text-left last:border-b-0 hover:bg-zinc-800/70"
                onClick={() => onSelect(repo)}
              >
                <div className="min-w-0">
                  <div className="truncate text-base font-medium text-zinc-100">{repo.name}</div>
                  <div className="truncate font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">{repo.fullName}</div>
                </div>
                <span className={shellButton("secondary")}>Use</span>
              </button>
            ))
          )}
        </div>
      </div>
    </ModalShell>
  );
}

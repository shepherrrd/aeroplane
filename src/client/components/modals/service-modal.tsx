import {
  AddSquareIcon,
  ArrowLeft01Icon,
  CheckmarkCircle02Icon,
  Cancel01Icon,
  Delete02Icon,
  FolderCodeIcon,
  FolderOpenIcon,
  GitBranchIcon,
  GithubIcon,
  Globe02Icon,
  MoreVerticalIcon,
  PackageIcon,
  PencilEdit02Icon,
  Search01Icon,
  Settings01Icon,
  WorkflowSquare07Icon
} from "@hugeicons/core-free-icons";
import { ClipboardEvent, FormEvent, ReactNode, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  type DeploymentLog,
  type GitHubDirectory,
  type GitHubRepo,
  type GitHubStatus,
  type RuntimeLog,
  type ServiceOverview
} from "../../api";
import { ModalShell } from "./modal-shell";
import {
  AppIcon,
  BrowserIconFallback,
  FieldLabel,
  FormInput,
  FormSelect,
  SectionTitle,
  StatusPill,
  chipClass,
  deploymentCardClass,
  shellButton
} from "../ui/primitives";
import { formatRelativeTime, formatTime, shortSha } from "../../lib/format";
import { githubBranchesCache, githubDirectoriesCache, githubReposCache } from "../../lib/github-cache";
import { DirectoryPickerModal } from "./directory-picker";
import { DirectoryTree } from "./directory-tree";
import { SourcePickerModal } from "./source-picker";
import type { ModalTab } from "./service-modal-types";

function formatBuildDuration(startedAt: null | string, finishedAt: null | string, nowMs: number) {
  const start = startedAt ? Date.parse(startedAt) : Number.NaN;
  const end = finishedAt ? Date.parse(finishedAt) : nowMs;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

  const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

type ParsedEnvEntry = {
  key: string;
  value: string;
};

function parseEnvText(input: string): ParsedEnvEntry[] {
  const byKey = new Map<string, string>();

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separatorIndex = normalized.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = normalized.slice(0, separatorIndex).trim();
    const value = normalized.slice(separatorIndex + 1).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) continue;

    byKey.set(key, value);
  }

  return Array.from(byKey.entries()).map(([key, value]) => ({ key, value }));
}

function LogsPanel({
  logs,
  emptyLabel,
  title,
  meta,
  actions
}: {
  logs: DeploymentLog[];
  emptyLabel: string;
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  const ref = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col border border-zinc-700 bg-zinc-900 p-4 text-zinc-100">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-400">
            <AppIcon icon={WorkflowSquare07Icon} size={16} />
            {title}
          </div>
          {meta ? <div className="mt-1 text-xs text-zinc-400">{meta}</div> : null}
        </div>
        {actions ? <div className="shrink-0 whitespace-nowrap">{actions}</div> : null}
      </div>
      <pre ref={ref} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-all font-mono text-sm leading-6 text-zinc-200">
        {logs.length > 0 ? logs.map((log) => `[${new Date(log.createdAt).toLocaleTimeString()}] ${log.line}`).join("\n") : emptyLabel}
      </pre>
    </div>
  );
}

function RuntimeLogsPanel({ logs, emptyLabel, title }: { logs: RuntimeLog[]; emptyLabel: string; title: string }) {
  const ref = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col border border-zinc-700 bg-zinc-900 p-4 text-zinc-100">
      <div className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-400">
        <AppIcon icon={WorkflowSquare07Icon} size={16} />
        {title}
      </div>
      <pre ref={ref} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-all font-mono text-sm leading-6 text-zinc-200">
        {logs.length > 0 ? logs.map((log) => `[${new Date(log.createdAt).toLocaleTimeString()}] ${log.line}`).join("\n") : emptyLabel}
      </pre>
    </div>
  );
}
export function ServiceModal({
  projectSlug,
  selectedTab,
  serviceId,
  onClose,
  onTabChange,
  onProjectRefresh,
  onDeleted
}: {
  projectSlug: string;
  selectedTab: ModalTab;
  serviceId: string;
  onClose: () => void;
  onTabChange: (tab: ModalTab) => void;
  onProjectRefresh: () => Promise<void> | void;
  onDeleted: () => void;
}) {
  const [overview, setOverview] = useState<null | ServiceOverview>(null);
  const [activeDeploymentId, setActiveDeploymentId] = useState<null | string>(null);
  const [deploymentLogs, setDeploymentLogs] = useState<DeploymentLog[]>([]);
  const [runtimeLogs, setRuntimeLogs] = useState<RuntimeLog[]>([]);
  const [envForm, setEnvForm] = useState({ key: "", value: "" });
  const [envSearch, setEnvSearch] = useState("");
  const [newEnvOpen, setNewEnvOpen] = useState(false);
  const [domainForm, setDomainForm] = useState({ hostname: "" });
  const [settings, setSettings] = useState({
    name: "",
    repoFullName: "",
    branch: "",
    rootDir: "",
    installCommand: "",
    buildCommand: "",
    startCommand: "",
    staticOutput: "",
    internalPort: 8080
  });
  const [settingsBranches, setSettingsBranches] = useState<string[]>([]);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [sourceQuery, setSourceQuery] = useState("");
  const [sourceRepos, setSourceRepos] = useState<GitHubRepo[]>([]);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState("");
  const [directoryPickerOpen, setDirectoryPickerOpen] = useState(false);
  const [settingsDirectoryNodes, setSettingsDirectoryNodes] = useState<Record<string, GitHubDirectory[]>>({});
  const [settingsExpandedDirectories, setSettingsExpandedDirectories] = useState<Set<string>>(new Set());
  const [settingsDirectoryError, setSettingsDirectoryError] = useState("");
  const [settingsDirectoryLoadingPaths, setSettingsDirectoryLoadingPaths] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());

  const loadOverview = useCallback(async () => {
    try {
      const result = await api.serviceOverview(serviceId);
      startTransition(() => {
        setOverview(result);
        setActiveDeploymentId((current) => current ?? result.deployments[0]?.id ?? null);
        setSettings({
          name: result.service.name,
          repoFullName: result.service.repoFullName ?? "",
          branch: result.service.branch,
          rootDir: result.service.rootDir ?? "",
          installCommand: result.service.installCommand ?? "",
          buildCommand: result.service.buildCommand ?? "",
          startCommand: result.service.startCommand ?? "",
          staticOutput: result.service.staticOutput ?? "",
          internalPort: result.service.internalPort
        });
        setError("");
      });
    } catch (issue) {
      startTransition(() => {
        setError(issue instanceof Error ? issue.message : "Could not load service");
      });
    }
  }, [serviceId]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview, serviceId]);

  useEffect(() => {
    const hasActiveDeployment = overview?.deployments.some((deployment) => deployment.status === "queued" || deployment.status === "building");
    if (!hasActiveDeployment && overview?.service.status !== "building") return;

    const interval = setInterval(() => {
      void loadOverview();
      void onProjectRefresh();
    }, 2000);

    return () => clearInterval(interval);
  }, [loadOverview, onProjectRefresh, overview]);

  const activeDeployment = useMemo(
    () => overview?.deployments.find((deployment) => deployment.id === activeDeploymentId) ?? null,
    [overview?.deployments, activeDeploymentId]
  );

  useEffect(() => {
    if (!activeDeployment || (activeDeployment.status !== "queued" && activeDeployment.status !== "building")) return;

    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [activeDeployment]);

  useEffect(() => {
    if (!activeDeploymentId) {
      setDeploymentLogs([]);
      return;
    }

    const events = new EventSource(`/api/deployments/${activeDeploymentId}/stream`);
    events.addEventListener("snapshot", (event) => {
      startTransition(() => setDeploymentLogs(JSON.parse((event as MessageEvent).data)));
    });
    events.addEventListener("log", (event) => {
      const log = JSON.parse((event as MessageEvent).data) as DeploymentLog;
      startTransition(() => setDeploymentLogs((current) => [...current, log]));
    });
    events.onerror = () => events.close();
    return () => events.close();
  }, [activeDeploymentId]);

  useEffect(() => {
    if (selectedTab !== "logs") return;

    const events = new EventSource(`/api/services/${serviceId}/runtime-logs/stream`);
    events.addEventListener("snapshot", (event) => {
      startTransition(() => setRuntimeLogs(JSON.parse((event as MessageEvent).data)));
    });
    events.addEventListener("log", (event) => {
      const log = JSON.parse((event as MessageEvent).data) as RuntimeLog;
      startTransition(() => setRuntimeLogs((current) => [...current, log]));
    });
    events.onerror = () => events.close();
    return () => events.close();
  }, [selectedTab, serviceId]);

  useEffect(() => {
    if (selectedTab !== "settings" || !settings.repoFullName) return;
    let cancelled = false;

    void (async () => {
      try {
        const cachedBranches = githubBranchesCache.get(settings.repoFullName);
        const nextBranches = cachedBranches ?? (await api.githubBranches(settings.repoFullName)).branches;
        if (!cachedBranches) githubBranchesCache.set(settings.repoFullName, nextBranches);
        if (cancelled) return;
        startTransition(() => setSettingsBranches(nextBranches));
      } catch {
        if (cancelled) return;
        startTransition(() => setSettingsBranches(settings.branch ? [settings.branch] : []));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedTab, settings.repoFullName, settings.branch]);

  useEffect(() => {
    if (selectedTab !== "settings" || !sourcePickerOpen) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      setSourceLoading(true);
      void (async () => {
        try {
          const cacheKey = sourceQuery.trim().toLowerCase();
          const cachedRepos = githubReposCache.get(cacheKey);
          const nextRepos = cachedRepos ?? (await api.githubRepos(sourceQuery)).repos;
          if (!cachedRepos) githubReposCache.set(cacheKey, nextRepos);
          if (cancelled) return;
          startTransition(() => {
            setSourceRepos(nextRepos);
            setSourceError("");
          });
        } catch (issue) {
          if (cancelled) return;
          startTransition(() => {
            setSourceRepos([]);
            setSourceError(issue instanceof Error ? issue.message : "Could not load repositories");
          });
        } finally {
          if (!cancelled) setSourceLoading(false);
        }
      })();
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [selectedTab, sourcePickerOpen, sourceQuery]);

  useEffect(() => {
    if (selectedTab !== "settings" || !directoryPickerOpen || !settings.repoFullName || !settings.branch) return;
    if (settingsDirectoryNodes[""]) return;
    void loadSettingsDirectoryLevel("");
  }, [selectedTab, directoryPickerOpen, settings.repoFullName, settings.branch, settingsDirectoryNodes]);

  useEffect(() => {
    setBranchMenuOpen(false);
    setSourcePickerOpen(false);
    setDirectoryPickerOpen(false);
  }, [selectedTab]);

  async function doAction(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await action();
      await loadOverview();
      await onProjectRefresh();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Something went wrong");
    } finally {
      setBusy("");
    }
  }

  async function loadSettingsDirectoryLevel(path: string) {
    if (!settings.repoFullName || !settings.branch) return;

    const cacheKey = `${settings.repoFullName}:${settings.branch}:${path}`;
    const cachedDirectories = githubDirectoriesCache.get(cacheKey);
    if (cachedDirectories) {
      startTransition(() => {
        setSettingsDirectoryNodes((current) => ({ ...current, [path]: cachedDirectories }));
      });
      return;
    }

    setSettingsDirectoryLoadingPaths((current) => new Set(current).add(path));
    setSettingsDirectoryError("");
    try {
      const nextDirectories = (await api.githubDirectories(settings.repoFullName, settings.branch, path)).directories;
      githubDirectoriesCache.set(cacheKey, nextDirectories);
      startTransition(() => {
        setSettingsDirectoryNodes((current) => ({ ...current, [path]: nextDirectories }));
      });
    } catch (issue) {
      startTransition(() => {
        setSettingsDirectoryError(issue instanceof Error ? issue.message : "Could not load directories");
      });
    } finally {
      setSettingsDirectoryLoadingPaths((current) => {
        const next = new Set(current);
        next.delete(path);
        return next;
      });
    }
  }

  async function toggleSettingsDirectory(path: string) {
    const isExpanded = settingsExpandedDirectories.has(path);
    if (isExpanded) {
      startTransition(() => {
        setSettingsExpandedDirectories((current) => {
          const next = new Set(current);
          next.delete(path);
          return next;
        });
      });
      return;
    }

    await loadSettingsDirectoryLevel(path);
    startTransition(() => {
      setSettingsExpandedDirectories((current) => new Set(current).add(path));
    });
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    await doAction("settings", async () => {
      await api.updateService(serviceId, {
        name: settings.name,
        repoFullName: settings.repoFullName.trim() ? settings.repoFullName : null,
        branch: settings.branch,
        rootDir: settings.rootDir || undefined,
        installCommand: settings.installCommand || undefined,
        buildCommand: settings.buildCommand || undefined,
        startCommand: settings.startCommand || undefined,
        staticOutput: settings.staticOutput || undefined,
        internalPort: Number(settings.internalPort)
      });
    });
  }

  async function abortActiveDeployment() {
    if (!activeDeployment || (activeDeployment.status !== "queued" && activeDeployment.status !== "building")) return;

    await doAction("abort", async () => {
      await api.abortDeployment(activeDeployment.id);
    });
  }

  async function populateEnvEntries(entries: ParsedEnvEntry[]) {
    await doAction("env", async () => {
      await Promise.all(entries.map((entry) => api.upsertEnv(serviceId, entry)));
      startTransition(() => {
        setEnvForm({ key: "", value: "" });
        setNewEnvOpen(false);
      });
    });
  }

  function handleEnvPaste(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData("text");
    const entries = parseEnvText(text);
    if (entries.length === 0) return;

    event.preventDefault();

    if (entries.length === 1) {
      startTransition(() => {
        setNewEnvOpen(true);
        setEnvForm(entries[0]);
      });
      return;
    }

    void populateEnvEntries(entries);
  }

  async function deleteService() {
    if (!overview?.service || !window.confirm(`Delete service "${overview.service.name}"?`)) return;
    setBusy("delete");
    try {
      await api.deleteService(serviceId);
      await onProjectRefresh();
      onDeleted();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not delete service");
    } finally {
      setBusy("");
    }
  }

  const service = overview?.service;
  const deployments = overview?.deployments ?? [];
  const env = overview?.env ?? [];
  const domains = overview?.domains ?? [];
  const filteredEnv = env.filter((item) => item.key.toLowerCase().includes(envSearch.trim().toLowerCase()));
  const activeDeploymentDuration =
    activeDeployment && (activeDeployment.status === "queued" || activeDeployment.status === "building")
      ? formatBuildDuration(activeDeployment.startedAt ?? activeDeployment.createdAt, activeDeployment.finishedAt, nowMs)
      : null;

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/45 p-4 backdrop-blur-sm">
        <div className="mx-auto flex min-h-full max-w-6xl items-center justify-center">
          <div className="flex h-[min(860px,calc(100vh-2rem))] min-h-[680px] w-full flex-col border border-zinc-700/90 bg-zinc-900/98 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] md:p-7">
            <div className="flex flex-col gap-4 pb-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 place-items-center border border-[#4FB8B2]/35 bg-[#4FB8B2]/10 text-[#7fe3dd]">
                  <AppIcon icon={FolderCodeIcon} size={20} />
                </div>
                <div>
                  <div className="mb-2 inline-flex items-center gap-2 border border-zinc-700 bg-zinc-800/90 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                    <AppIcon icon={FolderCodeIcon} size={14} />
                    {projectSlug}
                  </div>
                  <h2 className="font-hero text-3xl tracking-tight text-zinc-100">{service?.name ?? "Service"}</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                    <span>{service?.repoFullName ?? service?.repoUrl}</span>
                    {service ? <StatusPill status={service.status} /> : null}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={shellButton("secondary")} onClick={() => void doAction("deploy", async () => void api.createDeployment(serviceId))} disabled={busy === "deploy"}>
                  <AppIcon icon={WorkflowSquare07Icon} size={16} />
                  Deploy
                </button>
                <button type="button" className={shellButton("ghost")} onClick={onClose}>
                  Close
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {([
                ["deployments", PackageIcon],
                ["logs", WorkflowSquare07Icon],
                ["environment", Settings01Icon],
                ["domains", Globe02Icon],
                ["settings", GithubIcon]
              ] as Array<[ModalTab, unknown]>).map(([tab, icon]) => (
                <button key={tab} type="button" className={chipClass(selectedTab === tab)} onClick={() => onTabChange(tab)}>
                  <AppIcon icon={icon} size={15} />
                  <span className="capitalize">{tab}</span>
                </button>
              ))}
            </div>

            {error ? <div className="mt-3 border border-rose-500/25 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

            <div className={`mt-4 min-h-0 flex-1 pr-1 ${selectedTab === "deployments" || selectedTab === "logs" ? "overflow-hidden" : "overflow-y-auto"}`}>
              {selectedTab === "deployments" ? (
                <div className="flex h-full min-h-0 flex-col gap-4 lg:flex-row">
                  <div className="min-h-0 overflow-y-auto pr-1 lg:w-[340px] lg:flex-none">
                    <div className="space-y-3">
                    {deployments.map((deployment) => (
                      <button
                        key={deployment.id}
                        type="button"
                        className={`flex w-full items-center justify-between border px-4 py-3 text-left ${deploymentCardClass(
                          deployment.status,
                          deployment.id === activeDeploymentId
                        )}`}
                        onClick={() => {
                          setActiveDeploymentId(deployment.id);
                        }}
                      >
                        <div>
                          <div className="text-sm font-medium">{shortSha(deployment.commitSha)}</div>
                          <div
                            className={`mt-1 text-xs ${
                              deployment.id === activeDeploymentId
                                ? deployment.status === "failed"
                                  ? "text-red-700"
                                  : deployment.status === "building" || deployment.status === "queued"
                                    ? "text-amber-700"
                                    : deployment.status === "active" || deployment.status === "running"
                                      ? "text-emerald-700"
                                      : deployment.status === "superseded"
                                        ? "text-zinc-400"
                                        : "text-zinc-300"
                                : "text-zinc-400"
                            }`}
                          >
                            {formatTime(deployment.createdAt)}
                            {deployment.status === "queued" || deployment.status === "building"
                              ? ` • ${formatBuildDuration(deployment.startedAt ?? deployment.createdAt, deployment.finishedAt, nowMs) ?? "0s"}`
                              : ""}
                          </div>
                        </div>
                        <StatusPill status={deployment.status} />
                      </button>
                    ))}
                    </div>
                  </div>
                  <div className="min-h-0 min-w-0 flex-1">
                    <LogsPanel
                      logs={deploymentLogs}
                      title="Deploy output"
                      meta={
                        activeDeploymentDuration
                          ? `${activeDeployment?.status === "queued" ? "Queued for" : "Building for"} ${activeDeploymentDuration}`
                          : undefined
                      }
                      actions={
                        activeDeployment && (activeDeployment.status === "queued" || activeDeployment.status === "building") ? (
                          <button
                            type="button"
                            className={shellButton("ghost")}
                            onClick={() => void abortActiveDeployment()}
                            disabled={busy === "abort"}
                          >
                            <AppIcon icon={Cancel01Icon} size={15} />
                            Abort build
                          </button>
                        ) : undefined
                      }
                      emptyLabel="Choose a deployment to inspect its build and deploy logs."
                    />
                  </div>
                </div>
              ) : null}

              {selectedTab === "logs" ? <RuntimeLogsPanel logs={runtimeLogs} title="Live service logs" emptyLabel="No runtime logs yet." /> : null}

              {selectedTab === "environment" ? (
                <div className="space-y-5">
                  <div className="flex flex-col gap-4 border-b border-zinc-800 pb-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-4">
                      <div className="text-2xl text-zinc-100">{env.length} Service Variables</div>
                      <div className="relative">
                        <AppIcon icon={Search01Icon} size={16} className="pointer-events-none absolute left-3 top-3 text-zinc-500" />
                        <FormInput value={envSearch} onChange={(event) => setEnvSearch(event.target.value)} placeholder="Search variables" className="w-64 pl-10" />
                      </div>
                    </div>
                    <button type="button" className={shellButton("secondary")} onClick={() => setNewEnvOpen((current) => !current)}>
                      <AppIcon icon={AddSquareIcon} size={16} />
                      New variable
                    </button>
                  </div>

                  {newEnvOpen ? (
                    <form
                      className="border border-zinc-700 bg-zinc-900/88 p-5"
                      autoComplete="off"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void doAction("env", async () => {
                          await api.upsertEnv(serviceId, envForm);
                          startTransition(() => {
                            setEnvForm({ key: "", value: "" });
                            setNewEnvOpen(false);
                          });
                        });
                      }}
                    >
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto]">
                          <div>
                            <FieldLabel>Key</FieldLabel>
                          <FormInput
                            value={envForm.key}
                            onChange={(event) => setEnvForm({ ...envForm, key: event.target.value })}
                            onPaste={handleEnvPaste}
                            placeholder="KEY"
                            autoComplete="off"
                            required
                          />
                          </div>
                          <div>
                            <FieldLabel>Value</FieldLabel>
                          <FormInput
                            type="password"
                            value={envForm.value}
                            onChange={(event) => setEnvForm({ ...envForm, value: event.target.value })}
                            onPaste={handleEnvPaste}
                            placeholder="VALUE"
                            autoComplete="new-password"
                            required
                          />
                          </div>
                        <div className="flex items-end gap-2">
                          <button type="submit" className={shellButton("primary")} disabled={busy === "env"}>
                            Save
                          </button>
                          <button type="button" className={shellButton("ghost")} onClick={() => setNewEnvOpen(false)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    </form>
                  ) : null}

                  <div className="overflow-hidden border border-zinc-700 bg-zinc-900/88">
                    {filteredEnv.length === 0 ? (
                      <div className="px-5 py-8 text-sm text-zinc-400">No service variables yet.</div>
                    ) : (
                      filteredEnv.map((item) => (
                        <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_180px_56px] items-center gap-4 border-b border-zinc-800 px-5 py-4 last:border-b-0">
                          <div className="flex min-w-0 items-center gap-4">
                            <span className="font-mono text-lg text-zinc-500">{`{ }`}</span>
                            <span className="truncate font-mono text-[15px] uppercase tracking-[0.06em] text-zinc-100">{item.key}</span>
                          </div>
                          <div className="font-mono text-[15px] text-zinc-300">********</div>
                          <button
                            type="button"
                            className="ml-auto inline-flex h-9 w-9 items-center justify-center text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
                            onClick={() => void doAction("env", async () => void api.deleteEnv(serviceId, item.id))}
                          >
                            <AppIcon icon={MoreVerticalIcon} size={18} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}

              {selectedTab === "domains" ? (
                <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
                  <form
                    className="border border-zinc-700 bg-zinc-900/88 p-5"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void doAction("domain", async () => {
                        await api.addDomain(serviceId, domainForm);
                        startTransition(() => setDomainForm({ hostname: "" }));
                      });
                    }}
                  >
                    <SectionTitle icon={Globe02Icon} title="Domains" meta="Local `.localhost` names or public hostnames." />
                    <div className="mt-5 space-y-4">
                      <div>
                        <FieldLabel>Hostname</FieldLabel>
                        <FormInput value={domainForm.hostname} onChange={(event) => setDomainForm({ hostname: event.target.value })} placeholder={`${service?.slug ?? "service"}.localhost`} required />
                      </div>
                      <button type="submit" className={`${shellButton("primary")} w-full`} disabled={busy === "domain"}>
                        <AppIcon icon={AddSquareIcon} size={16} />
                        Add domain
                      </button>
                    </div>
                  </form>
                  <div className="space-y-3">
                    {domains.map((domain) => (
                      <div key={domain.id} className="flex items-center justify-between border border-zinc-700 bg-zinc-900/88 px-4 py-4">
                        <div>
                          <div className="font-medium text-zinc-100">{domain.hostname}</div>
                          <div className="text-sm text-zinc-400">{domain.hostname.endsWith(".localhost") ? "Local route through Caddy" : "Public hostname"}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <StatusPill status={domain.status} />
                          <button type="button" className={shellButton("ghost")} onClick={() => void doAction("domain", async () => void api.deleteDomain(serviceId, domain.id))}>
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {selectedTab === "settings" ? (
                <form onSubmit={saveSettings} className="space-y-5">
                  <div className="grid gap-5 xl:grid-cols-2">
                    <div className="xl:col-span-2">
                      <FieldLabel>Repository</FieldLabel>
                      <div className="space-y-3 border border-zinc-700 bg-zinc-900/88 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[18px] text-zinc-100">{settings.repoFullName || "Disconnected"}</div>
                          <div className="flex items-center gap-2">
                            <button type="button" className={shellButton("secondary")} onClick={() => setSourcePickerOpen(true)}>
                              <AppIcon icon={PencilEdit02Icon} size={15} />
                              Change source
                            </button>
                            <button
                              type="button"
                              className={shellButton("ghost")}
                              onClick={() => {
                                setSettings((current) => ({ ...current, repoFullName: "" }));
                                setSourceQuery("");
                                setSourceRepos([]);
                                setSourcePickerOpen(false);
                              }}
                            >
                              <AppIcon icon={Cancel01Icon} size={15} />
                              Disconnect
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="relative">
                      <FieldLabel>Branch</FieldLabel>
                      <button
                        type="button"
                        className="flex h-11 w-full items-center justify-between border border-zinc-700 bg-zinc-900 px-3 text-left text-sm text-zinc-100"
                        onClick={() => setBranchMenuOpen((current) => !current)}
                        disabled={!settings.repoFullName}
                      >
                        <span>{settings.branch || "Select branch"}</span>
                        <AppIcon icon={ArrowLeft01Icon} size={16} className={branchMenuOpen ? "rotate-90" : "-rotate-90"} />
                      </button>
                      {branchMenuOpen ? (
                        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 max-h-64 overflow-auto border border-zinc-700 bg-zinc-900 shadow-[0_20px_40px_rgba(0,0,0,0.35)]">
                          {(settingsBranches.length ? settingsBranches : [settings.branch]).map((branch) => (
                            <button
                              key={branch}
                              type="button"
                              className="flex w-full items-center justify-between border-b border-zinc-800 px-3 py-3 text-left text-sm text-zinc-100 last:border-b-0 hover:bg-zinc-800"
                              onClick={() => {
                                setSettings((current) => ({ ...current, branch }));
                                setBranchMenuOpen(false);
                                setSettingsDirectoryNodes({});
                                setSettingsExpandedDirectories(new Set());
                              }}
                            >
                              <span>{branch}</span>
                              {settings.branch === branch ? <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#7fe3dd]">Current</span> : null}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div>
                      <FieldLabel>Directory</FieldLabel>
                      <div className="flex h-11 items-center justify-between gap-3 border border-zinc-700 bg-zinc-900 px-3">
                        <div className="truncate text-sm text-zinc-100">{settings.rootDir || "."}</div>
                        <button
                          type="button"
                          className="inline-flex h-9 items-center justify-center gap-2 border border-zinc-800 bg-zinc-900/70 px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-200 transition hover:border-zinc-700 hover:bg-zinc-900 disabled:opacity-60"
                          onClick={() => setDirectoryPickerOpen(true)}
                          disabled={!settings.repoFullName}
                        >
                          <AppIcon icon={PencilEdit02Icon} size={15} />
                          Edit
                        </button>
                      </div>
                    </div>

                    <div>
                      <FieldLabel>Service name</FieldLabel>
                      <FormInput value={settings.name} onChange={(event) => setSettings({ ...settings, name: event.target.value })} />
                    </div>
                    <div>
                      <FieldLabel>App port</FieldLabel>
                      <FormInput type="number" value={settings.internalPort} onChange={(event) => setSettings({ ...settings, internalPort: Number(event.target.value) })} />
                    </div>
                    <div>
                      <FieldLabel>Install command</FieldLabel>
                      <FormInput value={settings.installCommand} onChange={(event) => setSettings({ ...settings, installCommand: event.target.value })} placeholder="auto" />
                    </div>
                    <div>
                      <FieldLabel>Build command</FieldLabel>
                      <FormInput value={settings.buildCommand} onChange={(event) => setSettings({ ...settings, buildCommand: event.target.value })} placeholder="auto" />
                    </div>
                    <div>
                      <FieldLabel>Start command</FieldLabel>
                      <FormInput value={settings.startCommand} onChange={(event) => setSettings({ ...settings, startCommand: event.target.value })} placeholder="auto" />
                    </div>
                    <div>
                      <FieldLabel>Static output</FieldLabel>
                      <FormInput value={settings.staticOutput} onChange={(event) => setSettings({ ...settings, staticOutput: event.target.value })} placeholder="auto" />
                    </div>
                  </div>

                  <div className="flex justify-between gap-3 border-t border-zinc-800 pt-5">
                    <div className="flex items-center gap-3">
                      {service?.reachable ? (
                        <a
                          href={service.primaryUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-3 border border-zinc-700 bg-zinc-900/85 px-3 py-3 text-sm text-zinc-200 transition hover:border-[#4FB8B2]/45 hover:text-[#7fe3dd]"
                        >
                          <BrowserIconFallback size={17} />
                          <span className="truncate">{service.primaryUrl.replace(/^https?:\/\//, "")}</span>
                        </a>
                      ) : (
                        <div className="flex items-center gap-3 border border-rose-500/20 bg-rose-950/20 px-3 py-3 text-sm text-rose-200">
                          <BrowserIconFallback size={17} />
                          <span className="truncate">Service not reachable</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" className={shellButton("danger")} onClick={() => void deleteService()} disabled={busy === "delete"}>
                        <AppIcon icon={Delete02Icon} size={16} />
                        Delete service
                      </button>
                      <button type="submit" className={shellButton("primary")} disabled={busy === "settings"}>
                        <AppIcon icon={CheckmarkCircle02Icon} size={16} />
                        Save settings
                      </button>
                    </div>
                  </div>
                </form>
              ) : null}
            </div>
            </div>
          </div>
        </div>
      <SourcePickerModal
        open={sourcePickerOpen}
        query={sourceQuery}
        repos={sourceRepos}
        loading={sourceLoading}
        error={sourceError}
        onClose={() => setSourcePickerOpen(false)}
        onQueryChange={setSourceQuery}
        onSelect={(repo) => {
          setSettings((current) => ({
            ...current,
            repoFullName: repo.fullName,
            branch: repo.defaultBranch,
            rootDir: ""
          }));
          setSourcePickerOpen(false);
          setSourceQuery("");
          setSourceRepos([]);
          setSettingsDirectoryNodes({});
          setSettingsExpandedDirectories(new Set());
          setSettingsDirectoryError("");
        }}
      />

      <DirectoryPickerModal
        open={directoryPickerOpen}
        repoLabel={settings.repoFullName}
        selectedPath={settings.rootDir}
        directoriesByPath={settingsDirectoryNodes}
        expandedPaths={settingsExpandedDirectories}
        loadingPaths={settingsDirectoryLoadingPaths}
        errorMessage={settingsDirectoryError}
        onClose={() => setDirectoryPickerOpen(false)}
        onToggle={toggleSettingsDirectory}
        onSelect={(path) => setSettings((current) => ({ ...current, rootDir: path }))}
      />
    </>
  );
}

import {
  Add01Icon,
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
  WorkflowSquare07Icon,
  CloudServerIcon,
  CopyIcon,
  CopyCheckIcon,
  Refresh03Icon
} from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
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
import { AutocompleteInput } from "../ui/autocomplete-input";
import {
  AppIcon,
  BrowserIconFallback,
  FieldLabel,
  FormInput,
  FormSelect,
  FrameworkMark,
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
import { EnvVarRow } from "./env-var-row";

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
  const [suggestions, setSuggestions] = useState<Array<{ key: string; label: string }>>([]);
  const [domainForm, setDomainForm] = useState({ hostname: "" });
  const [expandedDomainId, setExpandedDomainId] = useState<string | null>(null);
  const [copiedIpDomainId, setCopiedIpDomainId] = useState<string | null>(null);
  const [editingDomainId, setEditingDomainId] = useState<string | null>(null);
  const [editingHostname, setEditingHostname] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
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
  const [refreshingDns, setRefreshingDns] = useState(false);

  const loadOverview = useCallback(async () => {
    try {
      const [result, suggs] = await Promise.all([
        api.serviceOverview(serviceId),
        api.suggestionKeys(serviceId).catch(() => ({ suggestions: [] }))
      ]);
      startTransition(() => {
        setOverview(result);
        setSuggestions(suggs.suggestions);
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
        repoFullName: isDatabase ? settings.repoFullName : (settings.repoFullName.trim() ? settings.repoFullName : null),
        branch: settings.branch,
        rootDir: isDatabase ? undefined : (settings.rootDir || undefined),
        installCommand: isDatabase ? undefined : (settings.installCommand || undefined),
        buildCommand: isDatabase ? undefined : (settings.buildCommand || undefined),
        startCommand: isDatabase ? undefined : (settings.startCommand || undefined),
        staticOutput: isDatabase ? undefined : (settings.staticOutput || undefined),
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
  const isDatabase = service?.repoUrl === "database" || (service?.repoFullName?.startsWith("database:") ?? false);
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
                <div className="flex min-w-0 items-start gap-3">
                  <div className="grid h-10 w-10 flex-none place-items-center overflow-hidden border border-zinc-700 bg-zinc-900/90 p-2.5 text-zinc-300">
                    <FrameworkMark framework={service?.framework ?? null} size={18} fallback={<AppIcon icon={Globe02Icon} size={18} />} />
                  </div>
                  <div className="min-w-0">
                    <div className="mb-2 inline-flex max-w-full items-center gap-2 border border-zinc-700 bg-zinc-800/90 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                      <AppIcon icon={isDatabase ? CloudServerIcon : GithubIcon} size={14} />
                      <span className="truncate">{isDatabase ? "Database Service" : (service?.repoFullName ?? service?.repoUrl)}</span>
                    </div>
                    <h2 className="truncate font-hero text-2xl tracking-tight text-zinc-100">{service?.name ?? "Service"}</h2>
                    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-3">
                      <Link
                        to="/$projectSlug"
                        params={{ projectSlug }}
                        search={{}}
                        className="inline-flex max-w-full items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-400 transition hover:text-[#7fe3dd]"
                      >
                        <AppIcon icon={FolderCodeIcon} size={14} />
                        <span className="truncate">{projectSlug}</span>
                      </Link>
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
                    {deployments.map((deployment) => {
                      const displayStatus = deployment.status === "running" ? "deployed" : deployment.status;
                      return (
                        <button
                          key={deployment.id}
                          type="button"
                          className={`flex w-full items-center justify-between border px-4 py-3 text-left ${deploymentCardClass(
                            displayStatus,
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
                                  ? displayStatus === "failed"
                                    ? "text-red-700"
                                    : displayStatus === "building" || displayStatus === "queued"
                                      ? "text-amber-700"
                                      : displayStatus === "active" || displayStatus === "deployed"
                                        ? "text-emerald-700"
                                        : displayStatus === "superseded"
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
                          <StatusPill status={displayStatus} />
                        </button>
                      );
                    })}
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
                      <AppIcon icon={Add01Icon} size={16} />
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
                          <AutocompleteInput
                            type="text"
                            value={envForm.value}
                            onChange={(val) => setEnvForm({ ...envForm, value: val })}
                            onPaste={handleEnvPaste}
                            suggestions={suggestions}
                            placeholder="VALUE"
                            autoComplete="off"
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
                        <EnvVarRow
                          key={item.id}
                          item={item}
                          busy={busy === "env"}
                          suggestions={suggestions}
                          onSave={async (key, value) => {
                            await doAction("env", async () => {
                              if (key !== item.key) {
                                await api.deleteEnv(serviceId, item.id);
                              }
                              await api.upsertEnv(serviceId, { key, value });
                            });
                          }}
                          onDelete={async () => {
                            await doAction("env", async () => {
                              await api.deleteEnv(serviceId, item.id);
                            });
                          }}
                        />
                      ))
                    )}
                  </div>
                </div>
              ) : null}

              {selectedTab === "domains" ? (
                <div className="space-y-6">
                  {/* Header row with Add button */}
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/90 pb-5">
                    <SectionTitle 
                      icon={Globe02Icon} 
                      title="Custom Domains" 
                      meta="Point public custom domains to this service and configure DNS records." 
                    />
                    {!showAddForm && (
                      <button
                        type="button"
                        className={shellButton("primary")}
                        onClick={() => {
                          setShowAddForm(true);
                          setDomainForm({ hostname: "" });
                        }}
                      >
                        <AppIcon icon={Add01Icon} size={16} />
                        Add Domain
                      </button>
                    )}
                  </div>

                  {/* Collapsible Add Domain inline form */}
                  {showAddForm && (
                    <form
                      className="border border-zinc-700 bg-zinc-900/60 p-5 space-y-4 w-full transition-all duration-200"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void doAction("domain", async () => {
                          await api.addDomain(serviceId, domainForm);
                          startTransition(() => {
                            setDomainForm({ hostname: "" });
                            setShowAddForm(false);
                          });
                        });
                      }}
                    >
                      <SectionTitle 
                        icon={Add01Icon} 
                        title="Add Custom Domain" 
                        meta="Input your registered domain name below." 
                      />
                      <div className="mt-4 flex items-end gap-3">
                        <div className="flex-1">
                          <FormInput 
                            value={domainForm.hostname} 
                            onChange={(event) => setDomainForm({ hostname: event.target.value })} 
                            placeholder="app.example.com" 
                            required 
                          />
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button 
                            type="submit" 
                            className={`${shellButton("primary")} !h-10 !px-4`}
                            disabled={busy === "domain"}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className={`${shellButton("ghost")} !h-10 !px-4`}
                            onClick={() => setShowAddForm(false)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </form>
                  )}

                  {/* Domains list */}
                  {(() => {
                    const visibleDomains = domains;

                    if (visibleDomains.length === 0) {
                      return (
                        <div className="border border-dashed border-zinc-800 bg-zinc-950/20 p-8 text-center rounded">
                          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 border border-zinc-850 text-zinc-500 mb-3">
                            <AppIcon icon={Globe02Icon} size={20} />
                          </div>
                          <h3 className="text-sm font-semibold text-zinc-300">No custom domains configured</h3>
                          <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1 leading-relaxed">
                            Add a public custom domain name to route internet traffic directly to this service with automatic SSL certificates.
                          </p>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-3">
                        {visibleDomains.map((domain) => {
                          const isExpanded = expandedDomainId === domain.id;
                          const parts = domain.hostname.split(".");
                          const isSub = parts.length > 2;
                          const hostName = isSub ? parts.slice(0, -2).join(".") : "@";
                          const targetIp = overview?.publicIp ?? "127.0.0.1";
                          const isCopied = copiedIpDomainId === domain.id;

                          const handleCopyIp = async (e: React.MouseEvent) => {
                            e.stopPropagation();
                            try {
                              await navigator.clipboard.writeText(targetIp);
                              setCopiedIpDomainId(domain.id);
                              setTimeout(() => setCopiedIpDomainId(null), 1500);
                            } catch (err) {
                              console.error("Failed to copy IP:", err);
                            }
                          };

                          const isEditing = editingDomainId === domain.id;
                          const isLocal = domain.hostname.endsWith(".localhost") || domain.hostname === "localhost" || domain.hostname === "127.0.0.1";

                          return (
                            <div 
                              key={domain.id} 
                              className={`border border-zinc-700 bg-zinc-900/88 transition-all duration-200 overflow-hidden ${
                                isLocal || isEditing ? "" : "hover:border-zinc-500 cursor-pointer"
                              }`}
                              onClick={() => {
                                if (!isLocal && !isEditing) {
                                  setExpandedDomainId(isExpanded ? null : domain.id);
                                }
                              }}
                            >
                              <div className="flex items-center justify-between px-5 py-4 select-none">
                                {isEditing ? (
                                  <form 
                                    className="flex flex-1 items-center gap-3" 
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      void doAction("domain", async () => {
                                        await api.updateDomain(serviceId, domain.id, { hostname: editingHostname });
                                        setEditingDomainId(null);
                                      });
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="flex-1 min-w-0">
                                      <input
                                        type="text"
                                        value={editingHostname}
                                        onChange={(e) => setEditingHostname(e.target.value)}
                                        className="w-full bg-zinc-950 border border-zinc-700 px-3 py-1.5 text-xs font-mono text-zinc-100 rounded focus:border-[#4FB8B2]/50 focus:outline-none"
                                        required
                                        placeholder="app.example.com"
                                      />
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <button
                                        type="submit"
                                        className={`${shellButton("primary")} !h-8 !px-3 font-semibold text-xs`}
                                        disabled={busy === "domain"}
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        className={`${shellButton("ghost")} !h-8 !px-3 text-xs`}
                                        onClick={() => setEditingDomainId(null)}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </form>
                                ) : (
                                  <>
                                    <div>
                                      <a
                                        href={isLocal ? `http://${domain.hostname}` : `https://${domain.hostname}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-semibold font-mono text-sm text-zinc-100 hover:text-[#4FB8B2] transition-colors flex items-center gap-2 w-fit"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <AppIcon icon={Globe02Icon} size={15} className="text-[#4FB8B2]" />
                                        {domain.hostname}
                                      </a>
                                      <div className="text-[10px] text-zinc-400 font-mono mt-1.5 uppercase tracking-wider flex items-center gap-1.5">
                                        <span>{isLocal ? "Local loopback DNS" : "Public custom domain"}</span>
                                        {!isLocal && (
                                          <span className="text-[9px] text-[#4FB8B2]/80 border border-[#4FB8B2]/30 px-1 py-0.2">
                                            {isExpanded ? "Click to collapse" : "Click to configure"}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <StatusPill status={domain.status} />
                                      <button 
                                        type="button" 
                                        className={shellButton("ghost")} 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingDomainId(domain.id);
                                          setEditingHostname(domain.hostname);
                                        }}
                                      >
                                        Edit
                                      </button>
                                      <button 
                                        type="button" 
                                        className={shellButton("ghost")} 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void doAction("domain", async () => void api.deleteDomain(serviceId, domain.id));
                                        }}
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>

                              {/* Expandable DNS panel */}
                              {isExpanded && (
                                <div className="border-t border-zinc-800 bg-zinc-950/45 p-5 space-y-4 font-sans" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex flex-col gap-1.5">
                                    <h4 className="text-xs font-semibold uppercase tracking-wider font-mono text-zinc-300">
                                      {domain.status === "active" 
                                        ? "✅ DNS Configured Correctly" 
                                        : "⚠️ DNS Configuration Required"}
                                    </h4>
                                    <p className="text-xs text-zinc-400 leading-relaxed">
                                      To route public internet traffic to your self-hosted service, configure an **A Record** at your domain registrar (Cloudflare, GoDaddy, Namecheap, etc.) using these details:
                                    </p>
                                  </div>

                                  <div className="border border-zinc-800 overflow-hidden font-mono text-xs rounded bg-zinc-900/10">
                                    <div className="grid grid-cols-[80px_100px_1fr_auto] bg-zinc-900/60 border-b border-zinc-800 px-4 py-2 text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">
                                      <div>Type</div>
                                      <div>Host</div>
                                      <div>Points To</div>
                                      <div className="text-right">Status</div>
                                    </div>
                                    <div className="grid grid-cols-[80px_100px_1fr_auto] items-center px-4 py-3 text-zinc-300">
                                      <div className="font-semibold text-emerald-400">A</div>
                                      <div className="bg-zinc-900/60 border border-zinc-800 px-1.5 py-0.5 rounded text-[10px] w-fit font-bold">{hostName}</div>
                                      <div className="flex items-center gap-2 truncate font-semibold text-zinc-100 select-all pr-4">
                                        {targetIp}
                                        <button 
                                          type="button" 
                                          onClick={handleCopyIp}
                                          className={`text-zinc-500 hover:text-zinc-300 transition-colors p-0.5`}
                                          title={isCopied ? "Copied!" : "Copy IP Address"}
                                        >
                                          <AppIcon icon={isCopied ? CopyCheckIcon : CopyIcon} size={13} />
                                        </button>
                                      </div>
                                      <div className="flex items-center justify-end text-right font-semibold text-[11px]">
                                        {domain.status === "active" ? (
                                          <span className="text-emerald-400">✓ Active</span>
                                        ) : (
                                          <span className="text-amber-500 animate-pulse">⚡ Pending</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex flex-col gap-4 border-t border-zinc-800/80 pt-4 mt-2 sm:flex-row sm:items-center sm:justify-between">
                                    <span className="text-[10px] text-zinc-500 font-mono leading-relaxed max-w-sm">
                                      {domain.status === "active" 
                                        ? "Perfect! Caddy reverse-proxy SSL/TLS certificates will automatically renew natively." 
                                        : "DNS propagation can take a few minutes. Click verify to check again."}
                                    </span>
                                    <button
                                      type="button"
                                      className="inline-flex h-8 items-center justify-center border border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 px-3.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] transition shrink-0 gap-1.5 hover:border-zinc-500 hover:text-white disabled:opacity-55 disabled:cursor-not-allowed"
                                      onClick={async () => {
                                        setRefreshingDns(true);
                                        try {
                                          await loadOverview();
                                        } finally {
                                          setRefreshingDns(false);
                                        }
                                      }}
                                      disabled={refreshingDns}
                                    >
                                      <AppIcon icon={Refresh03Icon} size={13} className={refreshingDns ? "animate-spin" : ""} /> Refresh & Verify
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              ) : null}

              {selectedTab === "settings" ? (
                <form onSubmit={saveSettings} className="space-y-5">
                  <div className="grid gap-5 xl:grid-cols-2">
                    {isDatabase ? (
                      <>
                        <div>
                          <FieldLabel>Service name</FieldLabel>
                          <FormInput value={settings.name} onChange={(event) => setSettings({ ...settings, name: event.target.value })} />
                        </div>
                        <div>
                          <FieldLabel>Database port (Internal)</FieldLabel>
                          <FormInput type="number" value={settings.internalPort} onChange={(event) => setSettings({ ...settings, internalPort: Number(event.target.value) })} />
                        </div>
                      </>
                    ) : (
                      <>
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
                      </>
                    )}
                  </div>

                  <div className="flex justify-between gap-3 border-t border-zinc-800 pt-5">
                    <div className="flex items-center gap-3">
                      {isDatabase ? (
                        <div className="flex items-center gap-3 border border-zinc-700 bg-zinc-900/85 px-3 py-3 text-sm text-zinc-200">
                          <BrowserIconFallback size={17} />
                          <span className="truncate">Connect at {window.location.hostname}:{service?.hostPort}</span>
                        </div>
                      ) : service?.reachable ? (
                        <a
                          href={service.primaryUrl.replace("127.0.0.1", window.location.hostname)}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-3 border border-zinc-700 bg-zinc-900/85 px-3 py-3 text-sm text-zinc-200 transition hover:border-[#4FB8B2]/45 hover:text-[#7fe3dd]"
                        >
                          <BrowserIconFallback size={17} />
                          <span className="truncate">{service.primaryUrl.replace("127.0.0.1", window.location.hostname).replace(/^https?:\/\//, "")}</span>
                        </a>
                      ) : (
                        <div className="flex items-center gap-3 border border-rose-500/20 bg-rose-950/20 px-3 py-3 text-sm text-rose-200">
                          <BrowserIconFallback size={17} />
                          <span className="truncate">Service crashed</span>
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

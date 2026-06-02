import {
  ArrowLeft01Icon,
  CheckmarkCircle02Icon,
  Cancel01Icon,
  Delete02Icon,
  DatabaseIcon,
  GithubIcon,
  Globe02Icon,
  PackageIcon,
  PencilEdit02Icon,
  LeftToRightListStarIcon,
  VariableIcon,
  VideoConsoleIcon,
  DashboardSquare02Icon,
  DatabaseExportIcon
} from "@hugeicons/core-free-icons";
import { FormEvent, startTransition, useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type DeploymentLog,
  type GitHubDirectory,
  type GitHubRepo,
  type RuntimeLog,
  type Service,
  type ServiceOverview
} from "../../api";
import {
  AppIcon,
  BrowserIconFallback,
  FieldLabel,
  FormInput,
  chipClass,
  shellButton
} from "../../components/ui/primitives";
import { githubBranchesCache, githubDirectoriesCache, githubReposCache } from "../../lib/github-cache";
import { DirectoryPickerModal } from "../../components/modals/directory-picker";
import { SourcePickerModal } from "../../components/modals/source-picker";
import { DatabaseServiceSettingsPanel } from "../../components/modals/database-service-settings-panel";
import { DatabaseBackupsPanel } from "../../components/modals/database-backups-panel";
import { DatabaseBrowserPanel } from "../../components/modals/database-browser-panel";
import { DatabaseSqlConsolePanel } from "../../components/modals/database-sql-console-panel";
import { RedisBrowserPanel } from "../../components/modals/redis-browser-panel";
import { ServicePageToolbar } from "./service-page-toolbar";
import { ServiceDeploymentsPanel } from "./service-deployments-panel";
import { ServiceDomainsPanel } from "./service-domains-panel";
import { ServiceVariablesPanel } from "./service-variables-panel";
import { formatBuildDuration } from "./service-format";
import { RuntimeLogsPanel } from "./service-log-panels";
import { ServiceOverviewPanel } from "./service-overview-panel";
import type { ServiceTab } from "./service-tabs";

function textOrNull(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

const serviceTabLabels: Record<ServiceTab, string> = {
  overview: "Overview",
  deployments: "Deployments",
  logs: "Logs",
  environment: "Variables",
  domains: "Domains",
  data: "Data",
  sql: "Console",
  backups: "Backups",
  settings: "Settings"
};

export function ServicePageShell({
  selectedTab,
  serviceId,
  onClose,
  onTabChange,
  onProjectRefresh,
  onDeleted,
  pageServices = [],
  onServiceSelect
}: {
  selectedTab: ServiceTab;
  serviceId: string;
  onClose: () => void;
  onTabChange: (tab: ServiceTab) => void;
  onProjectRefresh: () => Promise<void> | void;
  onDeleted: () => void;
  pageServices?: Service[];
  onServiceSelect?: (serviceSlug: string) => void;
}) {
  const [overview, setOverview] = useState<null | ServiceOverview>(null);
  const [activeDeploymentId, setActiveDeploymentId] = useState<null | string>(null);
  const [deploymentLogs, setDeploymentLogs] = useState<DeploymentLog[]>([]);
  const [runtimeLogs, setRuntimeLogs] = useState<RuntimeLog[]>([]);
  const [suggestions, setSuggestions] = useState<Array<{ key: string; label: string }>>([]);
  const [settings, setSettings] = useState({
    name: "",
    repoFullName: "",
    repoUrl: "",
    branch: "",
    rootDir: "",
    installCommand: "",
    buildCommand: "",
    startCommand: "",
    staticOutput: "",
    internalPort: 8080,
    databasePublicEnabled: true,
    databasePublicHostname: ""
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
      const [result, suggs] = await Promise.all([
        api.serviceOverview(serviceId),
        api.suggestionKeys(serviceId).catch(() => ({ suggestions: [], databaseVariables: [] }))
      ]);
      startTransition(() => {
        setOverview(result);
        setSuggestions(suggs.suggestions);
        setActiveDeploymentId((current) => current ?? result.deployments[0]?.id ?? null);
        setSettings({
          name: result.service.name,
          repoFullName: result.service.repoFullName ?? "",
          repoUrl: result.service.repoUrl,
          branch: result.service.branch,
          rootDir: result.service.rootDir ?? "",
          installCommand: result.service.installCommand ?? "",
          buildCommand: result.service.buildCommand ?? "",
          startCommand: result.service.startCommand ?? "",
          staticOutput: result.service.staticOutput ?? "",
          internalPort: result.service.internalPort,
          databasePublicEnabled: result.service.databasePublicEnabled,
          databasePublicHostname: result.service.databasePublicHostname ?? ""
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
    if (selectedTab !== "settings" || !settings.repoFullName || settings.repoFullName.startsWith("database:")) return;
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
        repoUrl: isDatabase ? undefined : (settings.repoFullName.trim() ? undefined : settings.repoUrl.trim() || undefined),
        branch: settings.branch,
        rootDir: isDatabase ? undefined : textOrNull(settings.rootDir),
        installCommand: isDatabase ? undefined : textOrNull(settings.installCommand),
        buildCommand: isDatabase ? undefined : textOrNull(settings.buildCommand),
        startCommand: isDatabase ? undefined : textOrNull(settings.startCommand),
        staticOutput: isDatabase ? undefined : textOrNull(settings.staticOutput),
        internalPort: Number(settings.internalPort),
        databasePublicEnabled: isDatabase ? true : undefined,
        databasePublicHostname: isDatabase ? settings.databasePublicHostname || undefined : undefined
      });
    });
  }

  async function abortActiveDeployment() {
    if (!activeDeployment || (activeDeployment.status !== "queued" && activeDeployment.status !== "building")) return;

    await doAction("abort", async () => {
      await api.abortDeployment(activeDeployment.id);
    });
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
  const isGitUrlSource = Boolean(service && !isDatabase && !settings.repoFullName && settings.repoUrl);
  const databaseEngine = service?.repoFullName?.startsWith("database:")
    ? service.repoFullName.slice("database:".length).toLowerCase()
    : "";
  const hasSqlConsole = isDatabase && databaseEngine !== "redis" && databaseEngine !== "mongodb" && databaseEngine !== "mongo";
  const appTabs: Array<[ServiceTab, unknown]> = [
    ["overview", DashboardSquare02Icon],
    ["deployments", PackageIcon],
    ["logs", LeftToRightListStarIcon],
    ["environment", VariableIcon],
    ["domains", Globe02Icon],
    ["settings", GithubIcon]
  ];
  const databaseTabs: Array<[ServiceTab, unknown]> = [
    ["overview", DashboardSquare02Icon],
    ["data", DatabaseIcon],
    ["backups", DatabaseExportIcon],
    ["deployments", PackageIcon],
    ["logs", LeftToRightListStarIcon],
    ["environment", VariableIcon],
    ...(hasSqlConsole ? [["sql", VideoConsoleIcon] as [ServiceTab, unknown]] : []),
    ["settings", GithubIcon]
  ];
  const visibleTabs = isDatabase ? databaseTabs : appTabs;
  const deployments = overview?.deployments ?? [];
  const env = overview?.env ?? [];
  const domains = overview?.domains ?? [];
  const activeDeploymentDuration =
    activeDeployment && (activeDeployment.status === "queued" || activeDeployment.status === "building")
      ? formatBuildDuration(activeDeployment.startedAt ?? activeDeployment.createdAt, activeDeployment.finishedAt, nowMs)
      : null;
  const shellClass = "relative isolate h-dvh overflow-hidden bg-zinc-950 text-zinc-100";
  const viewportClass = "relative z-10 mx-auto flex h-full w-full max-w-7xl flex-col px-5 py-10 sm:px-6 lg:px-10";
  const panelClass = "flex min-h-0 w-full flex-1 flex-col";
  const tabButtonClass = (tab: ServiceTab) => `${chipClass(selectedTab === tab)} !py-1`;
  const tabUsesContainedScroll = selectedTab === "deployments" || selectedTab === "logs" || selectedTab === "data" || selectedTab === "sql" || selectedTab === "backups";
  const contentClass = `mt-6 min-h-0 flex-1 ${tabUsesContainedScroll ? "overflow-hidden" : "overflow-y-auto"}`;

  useEffect(() => {
    if (!service) return;
    if (isDatabase && selectedTab === "domains") {
      onTabChange("deployments");
    } else if (isDatabase && selectedTab === "sql" && !hasSqlConsole) {
      onTabChange("deployments");
    } else if (!isDatabase && (selectedTab === "data" || selectedTab === "sql" || selectedTab === "backups")) {
      onTabChange("deployments");
    }
  }, [hasSqlConsole, isDatabase, onTabChange, selectedTab, service]);

  return (
    <>
      <div className={shellClass}>
        <div aria-hidden className="hero-noise pointer-events-none absolute inset-0" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_0%_0%,rgba(79,184,178,0.10),transparent),radial-gradient(ellipse_70%_50%_at_100%_100%,rgba(120,113,255,0.06),transparent)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:72px_72px]"
        />
        <div className={viewportClass}>
          <div className={panelClass}>
            <ServicePageToolbar
              services={pageServices}
              currentService={service ?? null}
              onBack={onClose}
              onServiceSelect={onServiceSelect ?? (() => undefined)}
            />

            <div className="flex flex-wrap gap-2">
              {visibleTabs.map(([tab, icon]) => (
                <button key={tab} type="button" className={tabButtonClass(tab)} onClick={() => onTabChange(tab)}>
                  <AppIcon icon={icon} size={15} />
                  <span>{serviceTabLabels[tab]}</span>
                </button>
              ))}
            </div>

            {error ? <div className="mt-3 border border-rose-500/25 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

            <div className={contentClass}>
              {selectedTab === "overview" ? (
                service ? (
                  <ServiceOverviewPanel
                    service={service}
                    deployments={deployments}
                    env={env}
                    domains={domains}
                    pageServices={pageServices}
                    isDatabase={isDatabase}
                    databaseEngine={databaseEngine}
                    busy={busy}
                    nowMs={nowMs}
                    onDeploy={() => void doAction("deploy", async () => void api.createDeployment(serviceId))}
                    onTabChange={onTabChange}
                  />
                ) : null
              ) : null}

              {selectedTab === "deployments" ? (
                <ServiceDeploymentsPanel
                  deployments={deployments}
                  activeDeployment={activeDeployment}
                  activeDeploymentId={activeDeploymentId}
                  deploymentLogs={deploymentLogs}
                  activeDeploymentDuration={activeDeploymentDuration}
                  busy={busy}
                  nowMs={nowMs}
                  onSelectDeployment={setActiveDeploymentId}
                  onAbortActiveDeployment={() => void abortActiveDeployment()}
                />
              ) : null}

              {selectedTab === "logs" ? <RuntimeLogsPanel logs={runtimeLogs} title="Live service logs" emptyLabel="No runtime logs yet." /> : null}

              {selectedTab === "data" && isDatabase ? (
                databaseEngine === "redis" ? <RedisBrowserPanel serviceId={serviceId} /> : <DatabaseBrowserPanel serviceId={serviceId} />
              ) : null}

              {selectedTab === "sql" && hasSqlConsole ? <DatabaseSqlConsolePanel serviceId={serviceId} /> : null}

              {selectedTab === "backups" && isDatabase ? <DatabaseBackupsPanel serviceId={serviceId} /> : null}

              {selectedTab === "environment" ? (
                <ServiceVariablesPanel
                  serviceId={serviceId}
                  env={env}
                  suggestions={suggestions}
                  busy={busy}
                  doAction={doAction}
                />
              ) : null}

              {selectedTab === "domains" && !isDatabase ? (
                <ServiceDomainsPanel
                  serviceId={serviceId}
                  domains={domains}
                  publicIp={overview?.publicIp}
                  busy={busy}
                  doAction={doAction}
                  loadOverview={loadOverview}
                />
              ) : null}

              {selectedTab === "settings" ? (
                <form onSubmit={saveSettings} className="space-y-5">
                  <div className="grid gap-5 xl:grid-cols-2">
                    {isDatabase ? (
                      <>
                        <DatabaseServiceSettingsPanel
                          settings={settings}
                          hostPort={service?.hostPort}
                          onChange={(nextSettings) => setSettings({ ...settings, ...nextSettings })}
                        />
                      </>
                    ) : (
                      <>
                        <div className="xl:col-span-2">
                          <FieldLabel>Repository</FieldLabel>
                          <div className="space-y-3 border border-zinc-700 bg-zinc-900/88 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div className="break-all text-[18px] text-zinc-100">{settings.repoFullName || settings.repoUrl || "Disconnected"}</div>
                              <div className="flex items-center gap-2">
                                <button type="button" className={shellButton("secondary")} onClick={() => setSourcePickerOpen(true)}>
                                  <AppIcon icon={PencilEdit02Icon} size={15} />
                                  Change source
                                </button>
                                <button
                                  type="button"
                                  className={shellButton("ghost")}
                                  onClick={() => {
                                    setSettings((current) => ({ ...current, repoFullName: "", repoUrl: "" }));
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
                          {isGitUrlSource ? (
                            <FormInput value={settings.branch} onChange={(event) => setSettings({ ...settings, branch: event.target.value })} placeholder="main" />
                          ) : (
                            <button
                              type="button"
                              className="flex h-11 w-full items-center justify-between border border-zinc-700 bg-zinc-900 px-3 text-left text-sm text-zinc-100"
                              onClick={() => setBranchMenuOpen((current) => !current)}
                              disabled={!settings.repoFullName}
                            >
                              <span>{settings.branch || "Select branch"}</span>
                              <AppIcon icon={ArrowLeft01Icon} size={16} className={branchMenuOpen ? "rotate-90" : "-rotate-90"} />
                            </button>
                          )}
                          {!isGitUrlSource && branchMenuOpen ? (
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
                          {isGitUrlSource ? (
                            <FormInput value={settings.rootDir} onChange={(event) => setSettings({ ...settings, rootDir: event.target.value })} placeholder="." />
                          ) : (
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
                          )}
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
                          <span className="truncate">
                            {service?.databasePublicHostname
                              ? `Public TCP ${service.databasePublicHostname}:${service.hostPort}`
                              : `Public TCP port ${service?.hostPort}`}
                          </span>
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
            repoUrl: "",
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

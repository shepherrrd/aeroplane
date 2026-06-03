import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  DatabaseIcon,
  GithubIcon,
  PackageIcon,
  Settings01Icon,
  VariableIcon
} from "@hugeicons/core-free-icons";
import type { Deployment, Domain, EnvVar, Service } from "../../api";
import { DeployPlaneIcon } from "../../components/icons/deploy-plane-icon";
import { AppIcon, FrameworkMark, StatusPill, shellButton } from "../../components/ui/primitives";
import { formatRelativeTime, formatTime, shortSha } from "../../lib/format";
import { formatBuildDuration } from "./service-format";
import type { ServiceTab } from "./service-tabs";

type ServiceOverviewPanelProps = {
  service: Service;
  deployments: Deployment[];
  env: EnvVar[];
  domains: Domain[];
  pageServices: Service[];
  isDatabase: boolean;
  databaseEngine: string;
  busy: string;
  nowMs: number;
  onDeploy: () => void;
  onTabChange: (tab: ServiceTab) => void;
};

type OverviewStatProps = {
  label: string;
  value: string;
  meta?: string;
};

function displayStatus(status: string) {
  if (status === "running") return "current";
  if (status === "superseded") return "success";
  return status;
}

function repoLabel(service: Service, isDatabase: boolean, databaseEngine: string) {
  if (isDatabase) return databaseEngine ? `${databaseEngine} database` : "database";
  return service.repoFullName ?? service.repoUrl.replace(/^https?:\/\//, "").replace(/^github\.com\//, "");
}

function serviceLink(service: Service, isDatabase: boolean) {
  if (isDatabase) {
    const publicHost = service.databasePublicEnabled && service.databasePublicHostname
      ? `${service.databasePublicHostname}:${service.hostPort}`
      : "";
    return {
      label: publicHost || `${service.slug}:${service.internalPort}`,
      href: ""
    };
  }

  const href = service.primaryUrl || service.localUrl;
  return {
    label: href ? href.replace(/^https?:\/\//, "") : "No service link",
    href
  };
}

function valueOrAuto(value: null | string) {
  return value?.trim() || "auto";
}

function linkedServiceSlugs(env: EnvVar[]) {
  const slugs = new Set<string>();
  const referenceRegex = /\${([a-zA-Z0-9_.-]+)\.[a-zA-Z0-9_.-]+}/g;

  for (const item of env) {
    const source = `${item.value ?? ""}\n${item.resolvedValue ?? ""}`;
    for (const match of source.matchAll(referenceRegex)) {
      if (match[1]) slugs.add(match[1]);
    }
  }

  return slugs;
}

function warningItems({
  service,
  deployments,
  env,
  domains,
  isDatabase
}: {
  service: Service;
  deployments: Deployment[];
  env: EnvVar[];
  domains: Domain[];
  isDatabase: boolean;
}) {
  const warnings: string[] = [];
  const latest = deployments[0];

  if (!latest) warnings.push("No deployment has run yet.");
  if (latest?.status === "failed") warnings.push("Latest deployment failed.");
  if (latest?.status === "queued" || latest?.status === "building") warnings.push("Deployment is currently in progress.");
  if (!service.reachable && service.status !== "building" && service.status !== "queued") warnings.push("Runtime is not reachable.");
  if (!isDatabase && domains.some((domain) => domain.status !== "active")) warnings.push("One or more domains still need DNS verification.");
  if (env.length === 0) warnings.push("No service environment variables are configured.");
  if (!isDatabase && !service.repoFullName && !service.repoUrl) warnings.push("No source repository is connected.");

  return warnings;
}

function OverviewStat({ label, value, meta }: OverviewStatProps) {
  return (
    <div className="border border-zinc-800 bg-zinc-950/50 px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">{label}</div>
      <div className="mt-2 truncate text-sm font-medium text-zinc-100">{value}</div>
      {meta ? <div className="mt-1 truncate text-xs text-zinc-500">{meta}</div> : null}
    </div>
  );
}

function SectionHeader({ icon, title, meta }: { icon: unknown; title: string; meta?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <AppIcon icon={icon} size={16} className="text-[#7fe3dd]" />
        <h3 className="truncate font-mono text-xs font-semibold uppercase tracking-[0.18em] text-zinc-300">{title}</h3>
      </div>
      {meta ? <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">{meta}</span> : null}
    </div>
  );
}

function DefinitionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-2 border-b border-zinc-900/80 py-2.5 last:border-b-0 sm:grid-cols-[150px_minmax(0,1fr)]">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</div>
      <div className="min-w-0 truncate font-mono text-xs text-zinc-200">{value}</div>
    </div>
  );
}

export function ServiceOverviewPanel({
  service,
  deployments,
  env,
  domains,
  pageServices,
  isDatabase,
  databaseEngine,
  busy,
  nowMs,
  onDeploy,
  onTabChange
}: ServiceOverviewPanelProps) {
  const latestDeployment = deployments[0] ?? null;
  const latestStatus = latestDeployment ? displayStatus(latestDeployment.status) : "none";
  const latestDuration = latestDeployment
    ? formatBuildDuration(latestDeployment.startedAt ?? latestDeployment.createdAt, latestDeployment.finishedAt, nowMs)
    : null;
  const rootDir = service.rootDir || ".";
  const sourceLabel = repoLabel(service, isDatabase, databaseEngine);
  const sourceMeta = isDatabase ? "Managed database" : service.branch;
  const link = serviceLink(service, isDatabase);
  const warnings = warningItems({ service, deployments, env, domains, isDatabase });
  const linkedSlugs = linkedServiceSlugs(env);
  const linkedServices = pageServices.filter((candidate) => candidate.id !== service.id && linkedSlugs.has(candidate.slug));

  return (
    <div className="space-y-5">
      <section className="border border-zinc-800 bg-zinc-950/50 p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center border border-zinc-800 bg-zinc-900 p-2">
                <FrameworkMark framework={service.framework} size={26} fallback={<AppIcon icon={isDatabase ? DatabaseIcon : GithubIcon} size={22} className="text-zinc-300" />} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate font-hero text-2xl font-extrabold tracking-tight text-zinc-100">{service.name}</h2>
                  <StatusPill status={displayStatus(service.status)} />
                </div>
                {link.href ? (
                  <a className="mt-1 block truncate font-mono text-xs tracking-[0.16em] text-zinc-500 transition hover:text-[#7fe3dd]" href={link.href} target="_blank" rel="noreferrer">
                    {link.label}
                  </a>
                ) : (
                  <div className="mt-1 truncate font-mono text-xs tracking-[0.16em] text-zinc-500">{link.label}</div>
                )}
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <OverviewStat label="Source" value={sourceLabel} meta={sourceMeta} />
              <OverviewStat label="Last deploy" value={service.lastDeployedAt ? formatRelativeTime(service.lastDeployedAt) : "Never"} meta={formatTime(service.lastDeployedAt)} />
              <OverviewStat label="Environment" value={`${env.length} variable${env.length === 1 ? "" : "s"}`} meta={env.length ? "Configured for deploy" : "No variables yet"} />
              <OverviewStat label={isDatabase ? "Engine" : "App port"} value={isDatabase ? databaseEngine || "database" : String(service.internalPort)} meta={isDatabase ? `Internal ${service.internalPort}` : `Host ${service.hostPort}`} />
            </div>
          </div>
          <button type="button" className={`${shellButton("primary")} w-full lg:w-auto lg:min-w-40`} onClick={onDeploy} disabled={busy === "deploy"}>
            <DeployPlaneIcon size={15} />
            {busy === "deploy" ? "Deploying" : "Deploy"}
          </button>
        </div>
      </section>

      {warnings.length > 0 ? (
        <section className="border border-amber-500/25 bg-amber-950/10 p-4">
          <SectionHeader icon={Alert02Icon} title="Needs Attention" meta={`${warnings.length}`} />
          <div className="grid gap-2 md:grid-cols-2">
            {warnings.map((warning) => (
              <div key={warning} className="flex items-center gap-2 text-sm text-amber-100/90">
                <AppIcon icon={Alert02Icon} size={14} className="shrink-0 text-amber-300" />
                <span>{warning}</span>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="border border-emerald-500/20 bg-emerald-950/10 p-4">
          <div className="flex items-center gap-2 text-sm text-emerald-100/90">
            <AppIcon icon={CheckmarkCircle02Icon} size={15} className="text-emerald-300" />
            <span>No obvious issues detected from the latest service state.</span>
          </div>
        </section>
      )}

      <section className="border border-zinc-800 bg-zinc-950/45 p-5">
        <SectionHeader icon={PackageIcon} title="Latest Deployment" meta={latestStatus} />
        {latestDeployment ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <OverviewStat label="Status" value={latestStatus} meta={latestDeployment.trigger} />
              <OverviewStat label="Commit" value={shortSha(latestDeployment.commitSha)} meta={latestDeployment.imageTag ?? "image pending"} />
              <OverviewStat label="Duration" value={latestDuration ?? "Unknown"} meta={formatTime(latestDeployment.createdAt)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={shellButton("secondary")} onClick={() => onTabChange("deployments")}>
                View deploy output
              </button>
              {latestDeployment.status === "failed" ? (
                <button type="button" className={shellButton("primary")} onClick={onDeploy} disabled={busy === "deploy"}>
                  Redeploy
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="border border-dashed border-zinc-800 bg-zinc-950/50 p-6 text-sm text-zinc-500">No deployments yet. Deploy this service to populate the timeline.</div>
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-3">
        <section className="border border-zinc-800 bg-zinc-950/45 p-5">
          <SectionHeader icon={VariableIcon} title="Environment Readiness" />
          <div className="space-y-3">
            <OverviewStat label="Configured" value={`${env.length} variable${env.length === 1 ? "" : "s"}`} meta={env.length ? `${env.filter((item) => item.hasValue).length} with values` : "No variables yet"} />
            <div className="flex flex-wrap gap-2">
              {env.slice(0, 8).map((item) => (
                <span key={item.id} className="border border-zinc-800 bg-zinc-900/70 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-300">
                  {item.key}
                </span>
              ))}
              {env.length > 8 ? <span className="border border-zinc-800 bg-zinc-900/70 px-2 py-1 font-mono text-[10px] text-zinc-500">+{env.length - 8}</span> : null}
            </div>
            <button type="button" className={shellButton("secondary")} onClick={() => onTabChange("environment")}>
              Edit variables
            </button>
          </div>
        </section>

        <section className="border border-zinc-800 bg-zinc-950/45 p-5">
          <SectionHeader icon={Settings01Icon} title="Runtime Config" />
          <div>
            <DefinitionRow label="Root directory" value={rootDir} />
            <DefinitionRow label="Install" value={valueOrAuto(service.installCommand)} />
            <DefinitionRow label="Build" value={valueOrAuto(service.buildCommand)} />
            <DefinitionRow label="Start" value={valueOrAuto(service.startCommand)} />
            <DefinitionRow label="Static output" value={valueOrAuto(service.staticOutput)} />
          </div>
        </section>

        <section className="border border-zinc-800 bg-zinc-950/45 p-5">
          <SectionHeader icon={DatabaseIcon} title="Linked Services" meta={`${linkedServices.length}`} />
          {linkedServices.length > 0 ? (
            <div className="space-y-2">
              {linkedServices.map((linkedService) => (
                <div key={linkedService.id} className="flex items-center justify-between gap-3 border border-zinc-800 bg-zinc-900/55 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="grid h-7 w-7 shrink-0 place-items-center border border-zinc-800 bg-zinc-950 p-1.5">
                      <FrameworkMark framework={linkedService.framework} size={16} fallback={<AppIcon icon={DatabaseIcon} size={14} className="text-zinc-400" />} />
                    </span>
                    <span className="truncate text-sm text-zinc-200">{linkedService.name}</span>
                  </div>
                  <StatusPill status={displayStatus(linkedService.status)} />
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-zinc-800 bg-zinc-950/50 p-4 text-sm leading-6 text-zinc-500">
              No <code className="font-mono text-zinc-400">{"${service.variable}"}</code> references detected in this service’s variables.
            </div>
          )}
        </section>
      </div>

      <section className="border border-zinc-800 bg-zinc-950/45 p-5">
        <SectionHeader icon={Clock01Icon} title="Recent Activity" meta={`${deployments.length} deployments`} />
        {deployments.length > 0 ? (
          <div className="divide-y divide-zinc-900">
            {deployments.slice(0, 5).map((deployment) => (
              <div key={deployment.id} className="grid gap-3 py-3 md:grid-cols-[120px_minmax(0,1fr)_120px_110px] md:items-center">
                <StatusPill status={displayStatus(deployment.status)} />
                <div className="min-w-0 truncate font-mono text-xs text-zinc-300">{shortSha(deployment.commitSha)}</div>
                <div className="font-mono text-xs text-zinc-500">{deployment.trigger}</div>
                <div className="font-mono text-xs text-zinc-500">{formatRelativeTime(deployment.createdAt)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-zinc-500">No deployment activity yet.</div>
        )}
      </section>
    </div>
  );
}

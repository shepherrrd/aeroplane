import { ArrowLeft01Icon, CloudServerIcon } from "@hugeicons/core-free-icons";
import { Link, useNavigate } from "@tanstack/react-router";
import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { api, type ProjectDetail } from "../api";
import { ServicePageShell } from "../features/services/service-page-shell";
import { routeSegmentToServiceTab, serviceTabToRouteSegment, type ServiceTab } from "../features/services/service-tabs";
import { AppIcon, shellButton } from "../components/ui/primitives";
import { usePageTitle } from "../lib/page-title";

export function ServicePage({
  projectSlug,
  serviceSlug,
  serviceTab
}: {
  projectSlug: string;
  serviceSlug: string;
  serviceTab?: string;
}) {
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState("");
  const selectedTab = useMemo<ServiceTab>(() => routeSegmentToServiceTab(serviceTab), [serviceTab]);

  const loadProject = useCallback(async () => {
    try {
      const result = await api.project(projectSlug);
      startTransition(() => {
        setProject(result.project);
        setError("");
      });
    } catch (issue) {
      startTransition(() => {
        setError(issue instanceof Error ? issue.message : "Could not load project");
      });
    }
  }, [projectSlug]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  const service = project?.services.find((item) => item.slug === serviceSlug) ?? null;
  usePageTitle(service ? `${service.name} - ${project?.name ?? projectSlug}` : project?.name ?? projectSlug);

  function navigateToProject() {
    void navigate({ to: "/$projectSlug", params: { projectSlug } });
  }

  function navigateToTab(tab: ServiceTab) {
    const segment = serviceTabToRouteSegment[tab];
    if (segment === "overview") {
      void navigate({ to: "/$projectSlug/$serviceSlug", params: { projectSlug, serviceSlug } });
      return;
    }
    void navigate({ to: "/$projectSlug/$serviceSlug/$serviceTab", params: { projectSlug, serviceSlug, serviceTab: segment } });
  }

  function navigateToService(nextServiceSlug: string) {
    void navigate({ to: "/$projectSlug/$serviceSlug", params: { projectSlug, serviceSlug: nextServiceSlug } });
  }

  if (error) {
    return (
      <main className="relative isolate min-h-dvh overflow-hidden bg-zinc-950 px-5 py-12 text-zinc-100">
        <div className="mx-auto max-w-3xl border border-rose-500/35 bg-rose-950/25 p-6">
          <div className="font-hero text-xl">Could not load service</div>
          <p className="mt-2 text-sm text-rose-200">{error}</p>
          <button type="button" className={`${shellButton("ghost")} mt-5`} onClick={navigateToProject}>
            <AppIcon icon={ArrowLeft01Icon} size={16} />
            Back to project
          </button>
        </div>
      </main>
    );
  }

  if (!project) {
    return (
      <main className="relative isolate grid min-h-dvh place-items-center overflow-hidden bg-zinc-950 px-5 text-zinc-100">
        <div className="border border-zinc-800 bg-zinc-900/80 px-5 py-4 font-mono text-xs uppercase tracking-[0.18em] text-zinc-500">Loading service...</div>
      </main>
    );
  }

  if (!service) {
    return (
      <main className="relative isolate min-h-dvh overflow-hidden bg-zinc-950 px-5 py-12 text-zinc-100">
        <div className="mx-auto max-w-3xl border border-zinc-800 bg-zinc-900/80 p-8">
          <div className="grid h-12 w-12 place-items-center border border-zinc-800 bg-zinc-950 text-zinc-500">
            <AppIcon icon={CloudServerIcon} size={20} />
          </div>
          <h1 className="mt-5 font-hero text-2xl">Service not found</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">
            There is no service named <span className="font-mono text-zinc-300">{serviceSlug}</span> in this project.
          </p>
          <Link to="/$projectSlug" params={{ projectSlug }} className={`${shellButton("ghost")} mt-6`}>
            <AppIcon icon={ArrowLeft01Icon} size={16} />
            Back to project
          </Link>
        </div>
      </main>
    );
  }

  return (
    <ServicePageShell
      key={service.id}
      selectedTab={selectedTab}
      serviceId={service.id}
      onClose={navigateToProject}
      onTabChange={navigateToTab}
      onProjectRefresh={loadProject}
      onDeleted={navigateToProject}
      pageServices={project.services}
      onServiceSelect={navigateToService}
    />
  );
}

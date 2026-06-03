import { useNavigate } from "@tanstack/react-router";
import {
  AddSquareIcon,
  CloudServerIcon,
  CheckmarkCircle02Icon,
  Cancel01Icon,
  Delete02Icon,
  FolderOpenIcon,
  GitBranchIcon,
  GithubIcon,
  PencilEdit02Icon,
  Globe02Icon
} from "@hugeicons/core-free-icons";
import { FormEvent, startTransition, useCallback, useEffect, useState } from "react";
import { api, type ProjectCard, type ProjectDetail } from "../api";
import { AppIcon, FieldLabel, FormInput, FrameworkMark, shellButton } from "../components/ui/primitives";
import { CreateServiceModal } from "../components/modals/create-service-modal";
import { DeleteProjectModal } from "../components/modals/delete-project-modal";
import { ProjectPageToolbar } from "../features/projects/project-page-toolbar";
import type { ServiceFormPayload } from "../features/services/service-form-types";
import { formatTime } from "../lib/format";
import { usePageTitle } from "../lib/page-title";

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "active" || status === "running"
      ? "border-[#4FB8B2]/35 bg-[#4FB8B2]/10 text-[#4FB8B2]"
      : status === "building" || status === "queued"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
        : status === "crashed"
          ? "border-orange-500/30 bg-orange-500/10 text-orange-300"
          : status === "failed"
          ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
          : "border-zinc-700 bg-zinc-900/50 text-zinc-400";

  return <span className={`inline-flex border px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.2em] ${tone}`}>{status}</span>;
}

export function ProjectPage({ projectSlug }: { projectSlug: string }) {
  const navigate = useNavigate();
  const [project, setProject] = useState<null | ProjectDetail>(null);
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [createServiceOpen, setCreateServiceOpen] = useState(false);
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const [editingProject, setEditingProject] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: "", description: "" });
  const [error, setError] = useState("");

  const loadProject = useCallback(async () => {
    try {
      const [projectData, projectListData] = await Promise.all([
        api.project(projectSlug),
        api.projects().catch(() => ({ projects: [] }))
      ]);
      startTransition(() => {
        setProject(projectData.project);
        setProjects(projectListData.projects);
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
  }, [loadProject, projectSlug]);

  useEffect(() => {
    if (!project?.services.some((service) => service.status === "building")) return;
    const interval = setInterval(() => {
      void loadProject();
    }, 2500);
    return () => clearInterval(interval);
  }, [loadProject, project]);

  useEffect(() => {
    if (!project || editingProject) return;
    setProjectForm({ name: project.name, description: project.description ?? "" });
  }, [editingProject, project]);

  const projectTitle = project?.name ?? projectSlug;
  usePageTitle(projectTitle);

  async function createService(payload: ServiceFormPayload) {
    if (!project) return;
    const result = await api.createService(project.id, payload);
    await api.createDeployment(result.service.id);
    await loadProject();
    void navigate({
      to: "/$projectSlug/$serviceSlug/$serviceTab",
      params: { projectSlug, serviceSlug: result.service.slug, serviceTab: "deployments" }
    });
  }

  function navigateToProjects() {
    void navigate({ to: "/" });
  }

  function navigateToProject(nextProjectSlug: string) {
    void navigate({ to: "/$projectSlug", params: { projectSlug: nextProjectSlug } });
  }

  function navigateToServiceOverview(serviceSlug: string) {
    void navigate({ to: "/$projectSlug/$serviceSlug", params: { projectSlug, serviceSlug } });
  }

  async function saveProject(event: FormEvent) {
    event.preventDefault();
    if (!project) return;
    setSavingProject(true);
    setError("");
    try {
      const result = await api.updateProject(project.id, {
        name: projectForm.name,
        description: projectForm.description
      });
      startTransition(() => {
        setProject(result.project);
        setProjects((current) => current.map((item) => (item.id === result.project.id ? result.project : item)));
        setEditingProject(false);
      });
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not update project");
    } finally {
      setSavingProject(false);
    }
  }

  async function deleteProject() {
    if (!project) return;
    setDeletingProject(true);
    try {
      await api.deleteProject(project.id);
      void navigate({ to: "/" });
    } finally {
      setDeletingProject(false);
    }
  }

  return (
    <>
      <main className="relative isolate min-h-dvh overflow-hidden bg-zinc-950 text-zinc-100">
        <div aria-hidden className="hero-noise pointer-events-none absolute inset-0" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_0%_0%,rgba(79,184,178,0.12),transparent),radial-gradient(ellipse_70%_50%_at_100%_100%,rgba(120,113,255,0.08),transparent)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:72px_72px]"
        />

        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 pb-24 pt-14 sm:px-6 lg:pl-14 lg:pr-10">
          <section className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 flex-1">
              <ProjectPageToolbar
                projects={projects}
                currentProject={project}
                fallbackProjectName={projectSlug}
                onBack={navigateToProjects}
                onProjectSelect={navigateToProject}
              />
              {editingProject ? (
                <form onSubmit={saveProject} className="mt-4 max-w-2xl space-y-3">
                  <div>
                    <FieldLabel>Project name</FieldLabel>
                    <FormInput value={projectForm.name} onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })} required />
                  </div>
                  <div>
                    <FieldLabel>Description</FieldLabel>
                    <FormInput
                      value={projectForm.description}
                      onChange={(event) => setProjectForm({ ...projectForm, description: event.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" className={shellButton("primary")} disabled={savingProject || !project}>
                      <AppIcon icon={CheckmarkCircle02Icon} size={16} />
                      Save
                    </button>
                    <button
                      type="button"
                      className={shellButton("ghost")}
                      onClick={() => {
                        setProjectForm({ name: project?.name ?? "", description: project?.description ?? "" });
                        setEditingProject(false);
                      }}
                      disabled={savingProject}
                    >
                      <AppIcon icon={Cancel01Icon} size={16} />
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="mt-4 flex min-w-0 items-start gap-3">
                  <div className="min-w-0">
                    <h1 className="font-hero text-3xl font-extrabold tracking-tight text-zinc-100 sm:text-4xl">{project?.name ?? projectSlug}</h1>
                    {project?.description ? <p className="mt-2 max-w-2xl font-mono text-sm leading-relaxed text-zinc-500">{project.description}</p> : null}
                  </div>
                  <button
                    type="button"
                    className="mt-1 inline-flex h-9 w-9 flex-none items-center justify-center border border-zinc-700 text-zinc-300 transition hover:border-[#4FB8B2]/50 hover:bg-[#4FB8B2]/10 hover:text-[#7fe3dd]"
                    onClick={() => setEditingProject(true)}
                    aria-label="Edit project"
                    disabled={!project}
                  >
                    <AppIcon icon={PencilEdit02Icon} size={15} />
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 border border-[#4FB8B2]/50 bg-[#4FB8B2]/15 px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-[#4FB8B2] transition-colors hover:bg-[#4FB8B2]/25"
                onClick={() => setCreateServiceOpen(true)}
              >
                <AppIcon icon={AddSquareIcon} size={16} />
                New service
              </button>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center border border-zinc-700 text-zinc-300 transition-colors hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50"
                onClick={() => setDeleteProjectOpen(true)}
                aria-label="Delete project"
              >
                <AppIcon icon={Delete02Icon} size={16} />
              </button>
            </div>
          </section>

          {error ? <div className="border border-rose-500/35 bg-rose-950/30 px-4 py-3 font-mono text-xs text-rose-300">{error}</div> : null}

          {!project || project.services.length === 0 ? (
            <section className="border border-zinc-800 bg-zinc-950/60 px-6 py-10 sm:px-8">
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 border border-zinc-800 bg-zinc-900/50 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  <AppIcon icon={CloudServerIcon} size={14} />
                  Empty project
                </div>
                <h2 className="mt-6 font-hero text-3xl font-extrabold tracking-tight text-zinc-100">No services yet</h2>
                <p className="mt-3 max-w-lg font-mono text-sm leading-relaxed text-zinc-500">
                  Add a service and wire up the repo, branch, directory, deployment history, and runtime surface from here.
                </p>
                <button
                  type="button"
                  className="mt-8 inline-flex items-center justify-center gap-2 border border-[#4FB8B2]/50 bg-[#4FB8B2]/15 px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-[#4FB8B2] transition-colors hover:bg-[#4FB8B2]/25"
                  onClick={() => setCreateServiceOpen(true)}
                >
                  <AppIcon icon={AddSquareIcon} size={16} />
                  Add service
                </button>
              </div>
            </section>
          ) : (
            <section className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
              {project.services.map((service) => {
                const isDatabase = service.repoUrl === "database" || (service.repoFullName?.startsWith("database:") ?? false);
                const visibleUrl = (service.primaryUrl || service.localUrl).replace("127.0.0.1", window.location.hostname);
                const visibleLabel = visibleUrl.replace(/^https?:\/\//, "");
                const repoLabel = service.repoFullName ?? service.repoUrl.replace(/^https?:\/\//, "").replace(/^github\.com\//, "");
                const rootLabel = service.rootDir ? service.rootDir : "repository root";
                const unavailableLabel = service.status === "crashed" ? "Crashed" : service.status === "failed" ? "Failed" : "Not reachable";
                const unavailableClass = service.status === "crashed" ? "text-orange-300/80" : service.status === "failed" ? "text-rose-300/80" : "text-zinc-500";

                return (
                  <article
                    key={service.id}
                    role="button"
                    tabIndex={0}
                    className="group relative border border-zinc-800 bg-zinc-950/60 p-5 text-left transition-colors hover:border-[#4FB8B2]/35 hover:bg-zinc-900/70"
                    onClick={() => navigateToServiceOverview(service.slug)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        navigateToServiceOverview(service.slug);
                      }
                    }}
                  >
                    <div className="relative z-10">
                      <div className="flex items-start gap-4">
                        <div className="grid h-12 w-12 flex-none place-items-center border border-zinc-700 bg-zinc-900/90 p-3">
                           <FrameworkMark framework={service.framework} size={24} fallback={<AppIcon icon={isDatabase ? CloudServerIcon : Globe02Icon} size={20} className="text-zinc-400" />} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h2 className="truncate font-sans text-xl font-semibold tracking-tight text-zinc-100">{service.name}</h2>
                              {isDatabase ? (
                                <div className="mt-1 truncate text-sm text-zinc-500 font-mono">
                                  Connect at {window.location.hostname}:{service.hostPort}
                                </div>
                              ) : service.reachable ? (
                                <div className="mt-1 flex items-center gap-2.5 min-w-0">
                                  <a
                                    href={visibleUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="truncate text-sm text-[#4FB8B2] hover:text-[#7fe3dd] transition"
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    {visibleLabel}
                                  </a>
                                  {service.preferredDomain && (
                                    <span 
                                      className={`inline-flex items-center px-1.5 py-0.2 rounded font-mono text-[9px] uppercase tracking-wider font-bold shrink-0 ${
                                        service.preferredDomain.status === "active"
                                          ? "border border-emerald-500/30 bg-emerald-950/25 text-emerald-400"
                                          : "border border-amber-500/30 bg-amber-950/25 text-amber-400 animate-pulse"
                                      }`}
                                    >
                                      {service.preferredDomain.status === "active" ? "✓ Active" : "⚡ Pending"}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className={`mt-1 truncate text-sm ${unavailableClass}`}>{unavailableLabel}</div>
                              )}
                            </div>
                            <StatusPill status={service.status} />
                          </div>
                        </div>
                      </div>

                      {isDatabase ? (
                        <>
                          <div className="mt-5 inline-flex max-w-full items-center gap-2 rounded-full bg-zinc-800/90 px-3 py-1.5 text-xs font-normal text-zinc-300">
                            <AppIcon icon={CloudServerIcon} size={15} className="flex-none" />
                            <span className="truncate">Database Service</span>
                          </div>

                          <div className="mt-4 flex flex-wrap items-center gap-2 font-mono text-xs text-zinc-500">
                            <span>{formatTime(service.lastDeployedAt ?? service.updatedAt)}</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="mt-5 inline-flex max-w-full items-center gap-2 rounded-full bg-zinc-800/90 px-3 py-1.5 text-xs font-normal text-zinc-300">
                            <AppIcon icon={GithubIcon} size={15} className="flex-none" />
                            <span className="truncate">{repoLabel}</span>
                          </div>

                          <div className="mt-4 flex min-w-0 items-center gap-2 text-sm text-zinc-300">
                            <AppIcon icon={FolderOpenIcon} size={16} className="flex-none text-zinc-500" />
                            <span className="truncate">Deploys from {rootLabel}</span>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-xs text-zinc-500">
                            <span>{formatTime(service.lastDeployedAt ?? service.updatedAt)}</span>
                            <span>on</span>
                            <span className="inline-flex items-center gap-1.5">
                              <AppIcon icon={GitBranchIcon} size={14} />
                              {service.branch}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>
          )}
        </div>
      </main>
      <CreateServiceModal projectId={project?.id ?? ""} open={createServiceOpen} onClose={() => setCreateServiceOpen(false)} onCreate={createService} />
      <DeleteProjectModal
        open={deleteProjectOpen}
        projectName={project?.name ?? projectSlug}
        busy={deletingProject}
        onClose={() => setDeleteProjectOpen(false)}
        onConfirm={() => void deleteProject()}
      />
    </>
  );
}

import { useNavigate } from "@tanstack/react-router";
import { AddSquareIcon, ArrowLeft01Icon, FolderCodeIcon, WorkflowSquare07Icon } from "@hugeicons/core-free-icons";
import { startTransition, useCallback, useEffect, useState } from "react";
import { api, type GitHubStatus, type ProjectCard, type ToolCheck } from "../api";
import { AppIcon } from "../components/ui/primitives";
import { GitHubInstallModal } from "../features/github/github-install-modal";
import { CreateProjectModal } from "../features/projects/create-project-modal";
import { formatTime } from "../lib/format";

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "active" || status === "running"
      ? "border-[#4FB8B2]/35 bg-[#4FB8B2]/10 text-[#4FB8B2]"
      : status === "building" || status === "queued"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
        : status === "failed"
          ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
          : "border-zinc-700 bg-zinc-900/50 text-zinc-400";

  return <span className={`inline-flex border px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.2em] ${tone}`}>{status}</span>;
}

export function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [tools, setTools] = useState<ToolCheck[]>([]);
  const [githubStatus, setGitHubStatus] = useState<null | GitHubStatus>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [githubInstallOpen, setGitHubInstallOpen] = useState(false);
  const [error, setError] = useState("");

  const loadProjects = useCallback(async () => {
    const [projectData, systemData, githubData] = await Promise.all([api.projects(), api.system(), api.githubStatus().catch(() => null)]);
    startTransition(() => {
      setProjects(projectData.projects);
      setTools(systemData.tools);
      setGitHubStatus(githubData);
      setGitHubInstallOpen(Boolean(githubData && githubData.mode === "app" && !githubData.installed && githubData.installUrl));
      setError("");
    });
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  async function createProject(payload: { name: string; description?: string }) {
    const result = await api.createProject(payload);
    await loadProjects();
    void navigate({ to: "/$projectSlug", params: { projectSlug: result.project.slug } });
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
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/90 pb-5 font-mono text-[11px] text-zinc-500">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center border border-[#4FB8B2]/35 bg-[#4FB8B2]/10 text-[#4FB8B2]">
                <AppIcon icon={WorkflowSquare07Icon} size={18} />
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-zinc-600">Deploy registry</div>
                <div className="font-hero text-lg tracking-tight text-zinc-100">Projects</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 lg:flex">
                {tools.slice(0, 4).map((tool) => (
                  <div key={tool.name} className="inline-flex items-center gap-2 border border-zinc-800 bg-zinc-900/50 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                    <span className={`h-1.5 w-1.5 rounded-full ${tool.ok ? "bg-[#4FB8B2]" : "bg-zinc-700"}`} />
                    {tool.name}
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 border border-[#4FB8B2]/50 bg-[#4FB8B2]/15 px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-[#4FB8B2] transition-colors hover:bg-[#4FB8B2]/25"
                onClick={() => setCreateOpen(true)}
              >
                <AppIcon icon={AddSquareIcon} size={16} />
                New project
              </button>
            </div>
          </header>

          {error ? (
            <div className="border border-rose-500/35 bg-rose-950/30 px-4 py-3 font-mono text-xs text-rose-300">
              {error}
            </div>
          ) : null}

          {projects.length === 0 ? (
            <section className="border border-zinc-800 bg-zinc-950/60 px-6 py-10 sm:px-8">
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 border border-zinc-800 bg-zinc-900/50 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  <AppIcon icon={FolderCodeIcon} size={14} />
                  Empty registry
                </div>
                <h2 className="mt-6 font-hero text-3xl font-extrabold tracking-tight text-zinc-100">No projects yet</h2>
                <p className="mt-3 max-w-lg font-mono text-sm leading-relaxed text-zinc-500">
                  Create a project first, then attach services inside it. Each service gets its own deploy timeline, runtime logs, variables, and domains.
                </p>
                <button
                  type="button"
                  className="mt-8 inline-flex items-center justify-center gap-2 border border-[#4FB8B2]/50 bg-[#4FB8B2]/15 px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-[#4FB8B2] transition-colors hover:bg-[#4FB8B2]/25"
                  onClick={() => setCreateOpen(true)}
                >
                  <AppIcon icon={AddSquareIcon} size={16} />
                  Create project
                </button>
              </div>
            </section>
          ) : (
            <section className="grid gap-5 xl:grid-cols-2">
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className="group border border-zinc-800 bg-zinc-950/60 p-6 text-left transition-colors hover:border-[#4FB8B2]/35 hover:bg-zinc-900/70"
                  onClick={() => void navigate({ to: "/$projectSlug", params: { projectSlug: project.slug } })}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="inline-flex items-center gap-2 border border-zinc-800 bg-zinc-900/50 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                        <AppIcon icon={FolderCodeIcon} size={14} />
                        {project.serviceCount} service{project.serviceCount === 1 ? "" : "s"}
                      </div>
                      <h2 className="mt-5 font-hero text-3xl font-bold tracking-tight text-zinc-100">{project.name}</h2>
                      <p className="mt-3 max-w-xl font-mono text-xs leading-relaxed text-zinc-500">{project.description || "Scoped deploy space for related services."}</p>
                    </div>
                    <StatusPill status={project.status} />
                  </div>

                  <div className="mt-8 overflow-x-auto border border-zinc-800 bg-zinc-950/80">
                    <table className="w-full min-w-[32rem] border-collapse font-mono text-left text-sm">
                      <thead>
                        <tr className="border-b border-zinc-800 text-[10px] uppercase tracking-[0.2em] text-zinc-600">
                          <th className="px-4 py-3 font-medium">service</th>
                          <th className="px-4 py-3 font-medium">repo</th>
                          <th className="px-4 py-3 text-right font-medium">state</th>
                        </tr>
                      </thead>
                      <tbody>
                        {project.services.slice(0, 3).map((service) => (
                          <tr key={service.id} className="border-b border-zinc-800/80 last:border-b-0">
                            <td className="px-4 py-4 text-zinc-200">{service.name}</td>
                            <td className="px-4 py-4 text-zinc-500">{service.repoFullName ?? service.repoUrl.replace(/^https?:\/\//, "")}</td>
                            <td className="px-4 py-4 text-right">
                              <StatusPill status={service.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-5 flex items-center justify-between font-mono text-[11px] text-zinc-500">
                    <span>updated {formatTime(project.lastUpdatedAt)}</span>
                    <span className="inline-flex items-center gap-2 text-zinc-300 transition group-hover:text-[#4FB8B2]">
                      inspect
                      <AppIcon icon={ArrowLeft01Icon} size={16} className="rotate-180" />
                    </span>
                  </div>
                </button>
              ))}
            </section>
          )}
        </div>
      </main>
      <CreateProjectModal open={createOpen} onClose={() => setCreateOpen(false)} onCreate={createProject} />
      <GitHubInstallModal open={githubInstallOpen} status={githubStatus} onClose={() => setGitHubInstallOpen(false)} />
    </>
  );
}

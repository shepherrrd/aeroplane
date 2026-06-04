import { Cancel01Icon, CheckmarkCircle02Icon, FolderOpenIcon } from "@hugeicons/core-free-icons";
import { useEffect, useMemo, useState } from "react";
import { api, type ProjectCard } from "../../api";
import { Dropdown } from "../ui/dropdown";
import { AppIcon, FieldLabel, shellButton } from "../ui/primitives";
import { ModalShell } from "./modal-shell";

type TransferServiceModalProps = {
  open: boolean;
  currentProjectId: string;
  serviceName: string;
  busy: boolean;
  onClose: () => void;
  onTransfer: (targetProjectId: string) => Promise<void>;
};

export function TransferServiceModal({
  open,
  currentProjectId,
  serviceName,
  busy,
  onClose,
  onTransfer
}: TransferServiceModalProps) {
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [targetProjectId, setTargetProjectId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setProjects([]);
      setTargetProjectId("");
      setError("");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    void api.projects()
      .then((result) => {
        if (cancelled) return;
        const nextProjects = result.projects.filter((project) => project.id !== currentProjectId);
        setProjects(nextProjects);
        setTargetProjectId((current) => nextProjects.some((project) => project.id === current) ? current : "");
      })
      .catch((issue) => {
        if (cancelled) return;
        setError(issue instanceof Error ? issue.message : "Could not load projects");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentProjectId, open]);

  const projectOptions = useMemo(
    () => projects.map((project) => ({ value: project.id, label: project.name })),
    [projects]
  );
  const selectedProject = projects.find((project) => project.id === targetProjectId) ?? null;

  async function submitTransfer() {
    if (!targetProjectId) return;

    setError("");
    try {
      await onTransfer(targetProjectId);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not transfer service");
    }
  }

  return (
    <ModalShell
      open={open}
      title="Move service"
      meta={serviceName}
      icon={FolderOpenIcon}
      onClose={onClose}
      width="max-w-xl"
      bodyClassName="min-h-0 flex-1"
    >
      <div className="space-y-5">
        <div className="border border-zinc-800 bg-zinc-950/55 p-4">
          <FieldLabel>Destination project</FieldLabel>
          <Dropdown
            value={targetProjectId}
            options={projectOptions}
            onChange={setTargetProjectId}
            disabled={loading || busy || projectOptions.length === 0}
            placeholder={loading ? "Loading projects..." : "Select project"}
          />
          <div className="mt-3 text-sm leading-6 text-zinc-400">
            {selectedProject
              ? `${serviceName} will move to ${selectedProject.name}.`
              : projectOptions.length > 0
                ? "Choose a project to move this service."
                : "Create another project before moving this service."}
          </div>
        </div>

        <div className="border border-zinc-800 bg-zinc-900/55 px-4 py-3 text-sm leading-6 text-zinc-400">
          Deployments, variables, domains, backups, and runtime state stay with the service.
        </div>

        {error ? <div className="border border-rose-500/25 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={shellButton("ghost")} onClick={onClose} disabled={busy}>
            <AppIcon icon={Cancel01Icon} size={15} />
            Cancel
          </button>
          <button type="button" className={shellButton("primary")} onClick={() => void submitTransfer()} disabled={busy || loading || !targetProjectId}>
            <AppIcon icon={CheckmarkCircle02Icon} size={15} />
            {busy ? "Moving" : "Move service"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

import { CheckmarkCircle02Icon, Refresh03Icon } from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type SystemUpdateInfo, type SystemUpdateRun } from "../../api";
import { AppIcon, shellButton, statusClass } from "../ui/primitives";
import { UpdateConfirmationModal } from "./update-confirmation-modal";

function formatCommitDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function updateStatusClass(status: SystemUpdateInfo["status"]) {
  if (status === "current") return statusClass("active");
  if (status === "available") return statusClass("building");
  if (status === "diverged") return statusClass("failed");
  return statusClass("unknown");
}

function updateStatusLabel(info: SystemUpdateInfo | null) {
  if (!info) return "Not checked";
  if (info.installType === "image" && info.status === "unknown") return "Image install";
  if (info.status === "current") return "Up to date";
  if (info.status === "available") return `${info.commits.length} update${info.commits.length === 1 ? "" : "s"}`;
  if (info.status === "diverged") return "Manual update";
  return "Unknown";
}

function runStatusLabel(run: SystemUpdateRun) {
  if (run.status === "running") return "Updating";
  if (run.status === "succeeded") return "Update complete";
  if (run.status === "failed") return "Update failed";
  return "Idle";
}

function handledRestartRunKey() {
  try {
    return window.sessionStorage.getItem("aeroplane:handled-update-restart") ?? "";
  } catch {
    return "";
  }
}

function rememberHandledRestartRun(runKey: string) {
  try {
    window.sessionStorage.setItem("aeroplane:handled-update-restart", runKey);
  } catch {
    // Storage can be unavailable in locked-down browsers; the in-memory guard still handles the current page.
  }
}

export function UpdatesSettingsPanel({ open }: { open: boolean }) {
  const [info, setInfo] = useState<SystemUpdateInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirmingUpdate, setConfirmingUpdate] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const handledRunRef = useRef("");

  const loadUpdates = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.systemUpdates();
      setInfo(result);
      if (result.error) {
        setError(result.error);
      }
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not check updates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadUpdates();
  }, [loadUpdates, open]);

  useEffect(() => {
    if (!open || info?.updateRun.status !== "running") return;
    const interval = window.setInterval(() => void loadUpdates(), 2500);
    return () => window.clearInterval(interval);
  }, [info?.updateRun.status, loadUpdates, open]);

  useEffect(() => {
    const run = info?.updateRun;
    if (!run || run.status === "idle" || !run.finishedAt) return;

    const runKey = `${run.status}:${run.finishedAt}`;
    if (handledRunRef.current === runKey) return;
    handledRunRef.current = runKey;

    if (run.status === "succeeded") {
      const restartAlreadyHandled = handledRestartRunKey() === runKey;
      setError("");
      setSuccess(
        run.restartQueued
          ? restartAlreadyHandled
            ? "Update applied. Aeroplane is restarting."
            : "Update applied. Aeroplane is restarting, then this page will refresh."
          : "Update built. Restart Aeroplane to load server changes."
      );
      if (run.restartQueued && !restartAlreadyHandled) {
        rememberHandledRestartRun(runKey);
        window.setTimeout(() => window.location.reload(), 5000);
      }
    }

    if (run.status === "failed") {
      setSuccess("");
      setError(run.error || "Update failed");
    }
  }, [info?.updateRun]);

  async function applyUpdate() {
    if (!info || info.status !== "available") return;

    setConfirmingUpdate(false);
    setApplying(true);
    setError("");
    setSuccess("");
    try {
      const result = await api.applySystemUpdate();
      setInfo((current) => (current ? { ...current, updateRun: result.updateRun } : current));
      setSuccess("Update started.");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not start update");
    } finally {
      setApplying(false);
    }
  }

  const run = info?.updateRun;
  const updateRunning = run?.status === "running";
  const canUpdate = Boolean(info && info.status === "available" && !info.dirty && info.canApplyUpdate && !updateRunning && !applying);

  return (
    <div className="space-y-5">
      <section className="border border-zinc-800 bg-zinc-950/45 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Updates</div>
            <h3 className="mt-2 font-hero text-2xl tracking-tight text-zinc-100">Aeroplane release channel</h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
              {info?.installType === "image"
                ? "This install is running from the published Docker image. Aeroplane compares the image commit with GitHub and can pull the next image when one is available."
                : "Compare this install with GitHub, review pending commits, and fast-forward when the checkout is clean."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] ${updateStatusClass(info?.status ?? "unknown")}`}>
              {loading ? "Checking" : updateStatusLabel(info)}
            </span>
            <button type="button" className={shellButton("secondary")} onClick={() => void loadUpdates()} disabled={loading || updateRunning}>
              <AppIcon icon={Refresh03Icon} size={13} className={loading ? "animate-spin" : ""} />
              Check updates
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">Repository</div>
            <div className="mt-2 truncate font-mono text-xs text-zinc-200">{info?.repo ?? "akinloluwami/aeroplane"}</div>
          </div>
          <div className="border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">Installed</div>
            <div className="mt-2 font-mono text-xs text-zinc-200">{info?.currentShortCommit ?? "unknown"}</div>
          </div>
          <div className="border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">GitHub</div>
            <div className="mt-2 font-mono text-xs text-zinc-200">
              {info?.remoteShortCommit ?? "unknown"}
              {info?.branch ? <span className="ml-2 text-zinc-500">/{info.branch}</span> : null}
            </div>
          </div>
        </div>
      </section>

      {info?.dirty ? (
        <div className="border border-amber-500/35 bg-amber-950/25 px-4 py-3 text-sm leading-relaxed text-amber-200">
          The Aeroplane checkout has local changes. Commit, deploy, or discard those changes before using the updater.
        </div>
      ) : null}

      {info?.installType === "image" ? (
        <section className="border border-zinc-800 bg-zinc-950/45 p-5">
          <h4 className="font-hero text-base tracking-tight text-zinc-100">{info.canApplyUpdate ? "Docker image updates" : "Update from the VPS"}</h4>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
            {!info.currentCommit
              ? "This image was built without commit metadata, so Aeroplane cannot compare it with GitHub yet. Publish the image with AEROPLANE_COMMIT_SHA to enable one-click updates."
              : info.canApplyUpdate
                ? "Aeroplane will pull the latest GHCR image through a short-lived updater container, then replace the running app container."
                : "This container does not include a git checkout, and one-click image updates are not configured for this install. Publish a new GHCR image, then run this on the VPS."}
          </p>
          {!info.canApplyUpdate || info.status === "unknown" ? (
            <pre className="mt-4 overflow-x-auto border border-zinc-800 bg-black/35 px-4 py-3 font-mono text-[11px] leading-relaxed text-zinc-300">
              {info.updateCommand ?? "cd /opt/aeroplane && sudo docker compose pull aeroplane && sudo docker compose up -d aeroplane"}
            </pre>
          ) : null}
        </section>
      ) : null}

      {info?.status === "current" ? (
        <section className="flex min-h-[220px] items-center justify-center border border-zinc-800 bg-zinc-950/45 p-8 text-center">
          <div>
            <div className="mx-auto grid h-12 w-12 place-items-center border border-emerald-500/35 bg-emerald-500/10 text-emerald-300">
              <AppIcon icon={CheckmarkCircle02Icon} size={22} />
            </div>
            <h3 className="mt-5 font-hero text-xl tracking-tight text-zinc-100">Aeroplane is up to date</h3>
            <p className="mt-2 text-sm text-zinc-500">Installed commit matches GitHub.</p>
          </div>
        </section>
      ) : null}

      {info?.status === "available" ? (
        <section className="border border-zinc-800 bg-zinc-950/45">
          <div className="flex flex-col gap-3 border-b border-zinc-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="font-hero text-base tracking-tight text-zinc-100">Pending commits</h4>
              <p className="mt-1 text-sm text-zinc-400">
                {info.installType === "image" ? "Review the commits included in the next published image." : "Review the commits that will be applied in order."}
              </p>
            </div>
            <button type="button" className={shellButton("primary")} onClick={() => setConfirmingUpdate(true)} disabled={!canUpdate}>
              <AppIcon icon={Refresh03Icon} size={13} className={applying || updateRunning ? "animate-spin" : ""} />
              {updateRunning ? "Updating..." : info.installType === "image" ? "Pull latest image" : "Update Aeroplane"}
            </button>
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {info.commits.map((commit) => {
              const content = (
                <>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#4FB8B2]">{commit.shortSha}</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-100">{commit.title}</div>
                  <div className="mt-1 font-mono text-[10px] text-zinc-500">
                    {commit.author} · {formatCommitDate(commit.date)}
                  </div>
                </>
              );

              return commit.url ? (
                <a
                  key={commit.sha}
                  href={commit.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block border-b border-zinc-800 px-5 py-4 transition hover:bg-zinc-900/55"
                >
                  {content}
                </a>
              ) : (
                <div key={commit.sha} className="border-b border-zinc-800 px-5 py-4">
                  {content}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {info?.status === "diverged" ? (
        <div className="border border-rose-500/35 bg-rose-950/30 px-4 py-3 text-sm leading-relaxed text-rose-200">
          {info.installType === "image"
            ? "The running image commit is not an ancestor of GitHub main, so Aeroplane will not update automatically. Publish a fresh image manually."
            : "This checkout has diverged from GitHub, so Aeroplane will not update automatically. Pull or reconcile the repository manually."}
        </div>
      ) : null}

      {run && run.status !== "idle" ? (
        <section className="border border-zinc-800 bg-zinc-950/45">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
            <h4 className="font-hero text-base tracking-tight text-zinc-100">Update activity</h4>
            <span className={`px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] ${statusClass(run.status === "failed" ? "failed" : run.status === "running" ? "building" : "active")}`}>
              {runStatusLabel(run)}
            </span>
          </div>
          <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap px-5 py-4 font-mono text-[11px] leading-relaxed text-zinc-400">
            {run.logs.join("\n") || "No update output yet."}
          </pre>
        </section>
      ) : null}

      {error ? <div className="border border-rose-500/35 bg-rose-950/30 px-3.5 py-2.5 font-mono text-[10px] text-rose-300">{error}</div> : null}

      {success ? (
        <div className="flex items-center gap-2 border border-emerald-500/35 bg-emerald-950/30 px-3.5 py-2.5 font-mono text-[10px] text-emerald-300">
          <AppIcon icon={CheckmarkCircle02Icon} size={13} />
          {success}
        </div>
      ) : null}

      <UpdateConfirmationModal
        applying={applying}
        installType={info?.installType ?? "git"}
        open={confirmingUpdate}
        onCancel={() => setConfirmingUpdate(false)}
        onConfirm={() => void applyUpdate()}
      />
    </div>
  );
}

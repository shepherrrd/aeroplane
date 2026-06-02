import { useEffect, useState } from "react";
import { api } from "../../api";

const minConcurrency = 1;
const maxConcurrency = 10;

function clampConcurrency(value: number) {
  if (!Number.isFinite(value)) return 3;
  return Math.min(maxConcurrency, Math.max(minConcurrency, Math.round(value)));
}

export function DeploymentSettingsPanel({ open }: { open: boolean }) {
  const [deploymentConcurrency, setDeploymentConcurrency] = useState(3);
  const [savedConcurrency, setSavedConcurrency] = useState(3);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadSettings() {
    setLoading(true);
    setError("");
    try {
      const result = await api.systemSettings();
      const next = clampConcurrency(result.settings.deploymentConcurrency);
      setDeploymentConcurrency(next);
      setSavedConcurrency(next);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not load deployment settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    void loadSettings();
  }, [open]);

  async function saveConcurrency(value: number) {
    const nextValue = clampConcurrency(value);
    setDeploymentConcurrency(nextValue);
    setSaving(true);
    setError("");
    try {
      const result = await api.updateSystemSettings({ deploymentConcurrency: nextValue });
      const next = clampConcurrency(result.settings.deploymentConcurrency);
      setDeploymentConcurrency(next);
      setSavedConcurrency(next);
    } catch (issue) {
      setDeploymentConcurrency(savedConcurrency);
      setError(issue instanceof Error ? issue.message : "Could not save deployment settings");
    } finally {
      setSaving(false);
    }
  }

  const busy = loading || saving;

  return (
    <section className="border border-zinc-800 bg-zinc-950/45 p-6">
      <div className="space-y-3">
        <h3 className="font-hero text-2xl tracking-tight text-zinc-100">Concurrent deployments</h3>
        <div className="inline-grid w-fit grid-cols-[44px_64px_44px]">
          <button
            type="button"
            className="grid h-11 place-items-center border border-zinc-700 bg-zinc-900 font-mono text-xl text-zinc-100 transition hover:border-[#4FB8B2]/60 hover:text-[#7fe3dd] disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => void saveConcurrency(deploymentConcurrency - 1)}
            disabled={busy || deploymentConcurrency <= minConcurrency}
            aria-label="Decrease concurrent deployments"
          >
            -
          </button>
          <div className="grid h-11 place-items-center border-y border-zinc-700 bg-zinc-950 font-mono text-base font-semibold text-zinc-100">
            {deploymentConcurrency}
          </div>
          <button
            type="button"
            className="grid h-11 place-items-center border border-zinc-700 bg-zinc-900 font-mono text-xl text-zinc-100 transition hover:border-[#4FB8B2]/60 hover:text-[#7fe3dd] disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => void saveConcurrency(deploymentConcurrency + 1)}
            disabled={busy || deploymentConcurrency >= maxConcurrency}
            aria-label="Increase concurrent deployments"
          >
            +
          </button>
        </div>
      </div>
      {saving ? <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Saving...</div> : null}
      {error ? <div className="mt-4 border border-rose-500/35 bg-rose-950/25 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
    </section>
  );
}

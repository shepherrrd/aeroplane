import {
  CheckmarkCircle02Icon,
  CopyCheckIcon,
  CopyIcon,
  Delete02Icon,
  Globe02Icon,
  PencilEdit02Icon,
  Refresh03Icon
} from "@hugeicons/core-free-icons";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { AppIcon, FieldLabel, FormInput, shellButton, statusClass } from "../ui/primitives";

function cleanDomain(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").replace(/\.+$/, "");
}

export function ControlPlaneDomainSettingsPanel({ open }: { open: boolean }) {
  const [hostname, setHostname] = useState("");
  const [savedHostname, setSavedHostname] = useState("");
  const [publicIp, setPublicIp] = useState("127.0.0.1");
  const [dnsStatus, setDnsStatus] = useState<"active" | "pending">("pending");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [copiedIp, setCopiedIp] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const normalizedHostname = useMemo(() => cleanDomain(hostname), [hostname]);
  const hasSavedHostname = savedHostname.length > 0;
  const hasUnsavedChanges = normalizedHostname !== savedHostname;

  useEffect(() => {
    if (!open) return;

    async function loadSettings() {
      setError("");
      setSuccess("");
      try {
        const res = await api.systemSettings();
        const loadedHostname = cleanDomain(res.settings.controlPlaneHostname);
        setHostname(loadedHostname);
        setSavedHostname(loadedHostname);
        setEditing(!loadedHostname);
        setPublicIp(res.publicIp || "127.0.0.1");
        setDnsStatus(res.controlPlaneDnsStatus || "pending");
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : "Could not load dashboard domain settings");
      }
    }

    void loadSettings();
  }, [open]);

  async function copyIp() {
    try {
      await navigator.clipboard.writeText(publicIp);
      setCopiedIp(true);
      setTimeout(() => setCopiedIp(false), 1500);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not copy IP address");
    }
  }

  async function refreshSettings() {
    setVerifying(true);
    setError("");
    setSuccess("");
    try {
      const res = await api.systemSettings();
      const loadedHostname = cleanDomain(res.settings.controlPlaneHostname);
      const nextStatus = res.controlPlaneDnsStatus || "pending";
      setHostname(loadedHostname);
      setSavedHostname(loadedHostname);
      setDnsStatus(nextStatus);
      setPublicIp(res.publicIp || "127.0.0.1");
      setSuccess(nextStatus === "active" ? "Dashboard DNS is active." : "Still waiting on dashboard DNS.");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not verify dashboard DNS");
    } finally {
      setVerifying(false);
    }
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await api.updateSystemSettings({ controlPlaneHostname: normalizedHostname });
      const saved = cleanDomain(res.settings.controlPlaneHostname);
      const latest = await api.systemSettings();
      setHostname(saved);
      setSavedHostname(saved);
      setPublicIp(latest.publicIp || "127.0.0.1");
      setDnsStatus(latest.controlPlaneDnsStatus || "pending");
      setEditing(false);
      setSuccess(res.caddy?.ok === false ? `Dashboard domain saved. Caddy reload: ${res.caddy.detail}` : "Dashboard domain saved.");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not save dashboard domain");
    } finally {
      setSaving(false);
    }
  }

  async function clearHostname() {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await api.updateSystemSettings({ controlPlaneHostname: "" });
      setHostname("");
      setSavedHostname("");
      setDnsStatus("pending");
      setEditing(false);
      setSuccess("Dashboard domain removed.");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not remove dashboard domain");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 border border-zinc-800 bg-zinc-950/35 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center border border-[#4FB8B2]/35 bg-[#4FB8B2]/10 text-[#7fe3dd]">
            <AppIcon icon={Globe02Icon} size={18} />
          </div>
          <div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Dashboard domain</div>
            <h3 className="mt-1 font-hero text-xl tracking-tight text-zinc-100">{hasSavedHostname ? savedHostname : "No dashboard domain"}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              Point a hostname at this VPS and Aeroplane will serve the dashboard through Caddy with HTTPS.
            </p>
          </div>
        </div>

        {hasSavedHostname && !editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] ${statusClass(dnsStatus)}`}>
              {dnsStatus === "active" ? "DNS active" : "DNS pending"}
            </span>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center border border-zinc-700 bg-zinc-900 text-zinc-300 transition hover:border-[#4FB8B2]/45 hover:bg-[#4FB8B2]/10 hover:text-[#7fe3dd]"
              onClick={() => setEditing(true)}
              title="Edit dashboard domain"
              aria-label="Edit dashboard domain"
            >
              <AppIcon icon={PencilEdit02Icon} size={15} />
            </button>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center border border-zinc-700 bg-zinc-900 text-zinc-300 transition hover:border-rose-500/45 hover:bg-rose-500/10 hover:text-rose-300"
              onClick={() => void clearHostname()}
              title="Delete dashboard domain"
              aria-label="Delete dashboard domain"
            >
              <AppIcon icon={Delete02Icon} size={15} />
            </button>
          </div>
        ) : null}
      </div>

      {editing ? (
        <form onSubmit={saveSettings} className="space-y-3 border-t border-zinc-800 pt-4">
          <div>
            <FieldLabel>Dashboard domain</FieldLabel>
            <FormInput
              value={hostname}
              onBlur={() => setHostname(normalizedHostname)}
              onChange={(event) => setHostname(event.target.value)}
              placeholder="pilot.aeroplane.run"
              inputMode="url"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className={shellButton("primary")} disabled={saving || !normalizedHostname || !hasUnsavedChanges}>
              {saving ? "Saving..." : "Save dashboard domain"}
            </button>
            {hasSavedHostname ? (
              <button
                type="button"
                className={shellButton("ghost")}
                onClick={() => {
                  setHostname(savedHostname);
                  setEditing(false);
                }}
                disabled={saving}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {hasSavedHostname ? (
        <div className="overflow-hidden border border-zinc-800 bg-zinc-950/45 font-mono text-[11px]">
          <div className="grid grid-cols-[88px_minmax(0,1fr)] border-b border-zinc-800">
            <div className="border-r border-zinc-800 px-3 py-3 uppercase tracking-[0.18em] text-zinc-600">Type</div>
            <div className="px-3 py-3 font-semibold text-zinc-100">A</div>
          </div>
          <div className="grid grid-cols-[88px_minmax(0,1fr)] border-b border-zinc-800">
            <div className="border-r border-zinc-800 px-3 py-3 uppercase tracking-[0.18em] text-zinc-600">Host</div>
            <div className="px-3 py-3 font-semibold text-[#7fe3dd]">{savedHostname}</div>
          </div>
          <div className="grid grid-cols-[88px_minmax(0,1fr)]">
            <div className="border-r border-zinc-800 px-3 py-3 uppercase tracking-[0.18em] text-zinc-600">Value</div>
            <div className="flex min-w-0 items-center gap-2 px-3 py-3">
              <span className="truncate font-semibold text-zinc-100">{publicIp}</span>
              <button type="button" onClick={copyIp} className="shrink-0 p-0.5 text-zinc-500 transition-colors hover:text-zinc-200" title={copiedIp ? "Copied" : "Copy IP"}>
                <AppIcon icon={copiedIp ? CopyCheckIcon : CopyIcon} size={13} />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {hasSavedHostname ? (
        <button
          type="button"
          className="inline-flex h-10 items-center justify-center gap-2 border border-zinc-700 bg-zinc-900 px-3.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-55"
          onClick={() => void refreshSettings()}
          disabled={verifying}
        >
          <AppIcon icon={Refresh03Icon} size={13} className={verifying ? "animate-spin" : ""} />
          Verify DNS
        </button>
      ) : null}

      {error ? <div className="border border-rose-500/35 bg-rose-950/30 px-3.5 py-2.5 font-mono text-[10px] text-rose-300">{error}</div> : null}
      {success ? (
        <div className="flex items-center gap-2 border border-emerald-500/35 bg-emerald-950/30 px-3.5 py-2.5 font-mono text-[10px] text-emerald-300">
          <AppIcon icon={CheckmarkCircle02Icon} size={13} />
          {success}
        </div>
      ) : null}
    </section>
  );
}

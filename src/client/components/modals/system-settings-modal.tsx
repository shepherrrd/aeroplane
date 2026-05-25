import {
  AddSquareIcon,
  CheckmarkCircle02Icon,
  CopyCheckIcon,
  CopyIcon,
  Delete02Icon,
  Globe02Icon,
  PencilEdit02Icon,
  Refresh03Icon,
  Settings01Icon
} from "@hugeicons/core-free-icons";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { AppIcon, FieldLabel, FormInput, SectionTitle, shellButton, statusClass, surfaceClass } from "../ui/primitives";

function cleanDomain(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").replace(/\.+$/, "");
}

function recordNameFor(domain: string) {
  return domain ? `*.${domain}` : "*.your-domain.com";
}

export function SystemSettingsModal({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [rootDomain, setRootDomain] = useState("");
  const [savedRootDomain, setSavedRootDomain] = useState("");
  const [publicIp, setPublicIp] = useState("127.0.0.1");
  const [dnsStatus, setDnsStatus] = useState<"active" | "pending">("pending");
  const [copiedIp, setCopiedIp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [editingDomain, setEditingDomain] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const normalizedRootDomain = useMemo(() => cleanDomain(rootDomain), [rootDomain]);
  const hasSavedDomain = savedRootDomain.length > 0;
  const hasUnsavedChanges = normalizedRootDomain !== savedRootDomain;
  const wildcardHostname = recordNameFor(savedRootDomain || normalizedRootDomain);

  useEffect(() => {
    if (!open) return;

    async function loadSettings() {
      setError("");
      setSuccess("");
      try {
        const res = await api.systemSettings();
        const loadedDomain = cleanDomain(res.settings.rootDomain);
        setRootDomain(loadedDomain);
        setSavedRootDomain(loadedDomain);
        setEditingDomain(!loadedDomain);
        setInstructionsOpen(false);
        setPublicIp(res.publicIp || "127.0.0.1");
        setDnsStatus(res.dnsStatus || "pending");
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : "Could not load root domain settings");
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
      const loadedDomain = cleanDomain(res.settings.rootDomain);
      const nextStatus = res.dnsStatus || "pending";
      setRootDomain(loadedDomain);
      setSavedRootDomain(loadedDomain);
      setDnsStatus(nextStatus);
      setPublicIp(res.publicIp || "127.0.0.1");
      setSuccess(nextStatus === "active" ? "Wildcard DNS is active." : "Still waiting on DNS.");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not verify DNS");
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
      await api.updateSystemSettings({ rootDomain: normalizedRootDomain });
      const res = await api.systemSettings();
      const savedDomain = cleanDomain(res.settings.rootDomain);
      setRootDomain(savedDomain);
      setSavedRootDomain(savedDomain);
      setDnsStatus(res.dnsStatus || "pending");
      setPublicIp(res.publicIp || "127.0.0.1");
      setEditingDomain(false);
      setInstructionsOpen(true);
      setSuccess("Root domain saved.");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not save root domain");
    } finally {
      setSaving(false);
    }
  }

  async function clearRootDomain() {
    const confirmed = window.confirm("Remove the root domain from Aeroplane?");
    if (!confirmed) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await api.updateSystemSettings({ rootDomain: "" });
      setRootDomain("");
      setSavedRootDomain("");
      setDnsStatus("pending");
      setEditingDomain(false);
      setInstructionsOpen(false);
      setSuccess("Root domain removed.");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not remove root domain");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/45 p-4 backdrop-blur-sm">
      <div className="mx-auto flex min-h-full max-w-[94%] items-center justify-center lg:max-w-7xl">
        <div className={`${surfaceClass("flex h-[min(900px,calc(100vh-2rem))] min-h-[640px] w-full flex-col p-6 md:p-8")}`}>
          <div className="mb-6 flex items-start justify-between gap-4 border-b border-zinc-800/90 pb-5">
            <SectionTitle icon={Settings01Icon} title="System Settings" meta="Configure global infrastructure and routing." />
            <button type="button" className={shellButton("ghost")} onClick={onClose}>
              Close
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="grid h-full gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
              <aside className="space-y-1 border-r border-zinc-800/80 pr-6">
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-left font-mono text-xs font-semibold uppercase tracking-wider text-[#4FB8B2]"
                >
                  <AppIcon icon={Globe02Icon} size={15} />
                  Root Domain
                </button>
              </aside>

              <div className="space-y-5">
                {!hasSavedDomain && !editingDomain ? (
                  <section className="flex min-h-[440px] items-center justify-center border border-zinc-800 bg-zinc-950/45 p-8 text-center">
                    <div className="max-w-xl">
                      <div className="mx-auto grid h-14 w-14 place-items-center border border-[#4FB8B2]/35 bg-[#4FB8B2]/10 text-[#7fe3dd]">
                        <AppIcon icon={Globe02Icon} size={24} />
                      </div>
                      <h3 className="mt-6 font-hero text-2xl tracking-tight text-zinc-100">Set a root domain</h3>
                      <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                        Aeroplane uses this domain to create default URLs for every service, like api.your-domain.com.
                      </p>
                      <button type="button" className={`${shellButton("primary")} mt-8`} onClick={() => setEditingDomain(true)}>
                        <AppIcon icon={AddSquareIcon} size={16} />
                        Set root domain
                      </button>
                    </div>
                  </section>
                ) : null}

                {editingDomain ? (
                  <form onSubmit={saveSettings} className="space-y-5 border border-zinc-800 bg-zinc-950/45 p-6">
                    <div className="flex items-start gap-3">
                      <div className="grid h-11 w-11 shrink-0 place-items-center border border-[#4FB8B2]/35 bg-[#4FB8B2]/10 text-[#7fe3dd]">
                        <AppIcon icon={Globe02Icon} size={18} />
                      </div>
                      <div>
                        <h3 className="font-hero text-lg tracking-tight text-zinc-100">{hasSavedDomain ? "Change root domain" : "Set root domain"}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                          Enter the domain Aeroplane should use for generated service URLs.
                        </p>
                      </div>
                    </div>

                    <div>
                      <FieldLabel>Root domain</FieldLabel>
                      <FormInput
                        value={rootDomain}
                        onBlur={() => setRootDomain(normalizedRootDomain)}
                        onChange={(event) => setRootDomain(event.target.value)}
                        placeholder="pilot.aeroplane.run"
                        required
                        inputMode="url"
                        autoComplete="off"
                      />
                      <p className="mt-2 font-mono text-[10px] leading-relaxed text-zinc-500">
                        Services will receive URLs like <span className="text-[#4FB8B2]">{"{slug}"}.{normalizedRootDomain || "your-domain.com"}</span>.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button type="submit" className={shellButton("primary")} disabled={saving || !normalizedRootDomain || !hasUnsavedChanges}>
                        {saving ? "Saving..." : "Save root domain"}
                      </button>
                      {hasSavedDomain ? (
                        <button
                          type="button"
                          className={shellButton("ghost")}
                          onClick={() => {
                            setRootDomain(savedRootDomain);
                            setEditingDomain(false);
                          }}
                          disabled={saving}
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  </form>
                ) : null}

                {hasSavedDomain && !editingDomain ? (
                  <section className="space-y-4">
                    <div className="border border-zinc-800 bg-zinc-950/45 p-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Root domain</div>
                          <h3 className="mt-2 font-hero text-2xl tracking-tight text-zinc-100">{savedRootDomain}</h3>
                          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                            New services will get default URLs like <span className="text-[#4FB8B2]">api.{savedRootDomain}</span>.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] ${statusClass(dnsStatus)}`}>
                            {dnsStatus === "active" ? "DNS active" : "DNS pending"}
                          </span>
                          <button
                            type="button"
                            className="inline-flex h-9 w-9 items-center justify-center border border-zinc-700 bg-zinc-900 text-zinc-300 transition hover:border-[#4FB8B2]/45 hover:bg-[#4FB8B2]/10 hover:text-[#7fe3dd] disabled:opacity-55"
                            onClick={() => {
                              setRootDomain(savedRootDomain);
                              setEditingDomain(true);
                            }}
                            disabled={saving}
                            title="Edit root domain"
                            aria-label="Edit root domain"
                          >
                            <AppIcon icon={PencilEdit02Icon} size={15} />
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-9 w-9 items-center justify-center border border-zinc-700 bg-zinc-900 text-zinc-300 transition hover:border-rose-500/45 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-55"
                            onClick={() => void clearRootDomain()}
                            disabled={saving}
                            title="Delete root domain"
                            aria-label="Delete root domain"
                          >
                            <AppIcon icon={Delete02Icon} size={15} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="border border-zinc-800 bg-zinc-900/10">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                        onClick={() => setInstructionsOpen((value) => !value)}
                      >
                        <div>
                          <h4 className="font-hero text-base tracking-tight text-zinc-100">DNS setup instructions</h4>
                          <p className="mt-1 text-sm text-zinc-400">Add one wildcard A record to activate generated subdomains.</p>
                        </div>
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FB8B2]">
                          {instructionsOpen ? "Hide" : "Show"}
                        </span>
                      </button>

                      {instructionsOpen ? (
                        <div className="space-y-4 border-t border-zinc-800 px-5 py-5">
                          <div className="overflow-hidden border border-zinc-800 bg-zinc-950/45 font-mono text-[11px]">
                            <div className="grid grid-cols-[88px_minmax(0,1fr)] border-b border-zinc-800">
                              <div className="border-r border-zinc-800 px-3 py-3 uppercase tracking-[0.18em] text-zinc-600">Type</div>
                              <div className="px-3 py-3 font-semibold text-zinc-100">A</div>
                            </div>
                            <div className="grid grid-cols-[88px_minmax(0,1fr)] border-b border-zinc-800">
                              <div className="border-r border-zinc-800 px-3 py-3 uppercase tracking-[0.18em] text-zinc-600">Name</div>
                              <div className="px-3 py-3">
                                <div className="font-semibold text-zinc-100">*</div>
                                <div className="mt-1 truncate text-[10px] text-zinc-500">Full hostname: {wildcardHostname}</div>
                              </div>
                            </div>
                            <div className="grid grid-cols-[88px_minmax(0,1fr)]">
                              <div className="border-r border-zinc-800 px-3 py-3 uppercase tracking-[0.18em] text-zinc-600">Value</div>
                              <div className="flex min-w-0 items-center gap-2 px-3 py-3">
                                <span className="truncate font-semibold text-zinc-100">{publicIp}</span>
                                <button
                                  type="button"
                                  onClick={copyIp}
                                  className="shrink-0 p-0.5 text-zinc-500 transition-colors hover:text-zinc-200"
                                  title={copiedIp ? "Copied" : "Copy IP"}
                                >
                                  <AppIcon icon={copiedIp ? CopyCheckIcon : CopyIcon} size={13} />
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="grid gap-3 border-t border-zinc-800/80 pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                            <p className="text-xs leading-relaxed text-zinc-500">
                              DNS changes can take a few minutes. Aeroplane will use this wildcard to route service slugs and let Caddy issue certificates.
                            </p>
                            <button
                              type="button"
                              className="inline-flex h-10 items-center justify-center gap-2 border border-zinc-700 bg-zinc-900 px-3.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-55"
                              onClick={() => void refreshSettings()}
                              disabled={verifying}
                            >
                              <AppIcon icon={Refresh03Icon} size={13} className={verifying ? "animate-spin" : ""} />
                              Verify DNS
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                {error ? (
                  <div className="border border-rose-500/35 bg-rose-950/30 px-3.5 py-2.5 font-mono text-[10px] text-rose-300">
                    {error}
                  </div>
                ) : null}

                {success ? (
                  <div className="flex items-center gap-2 border border-emerald-500/35 bg-emerald-950/30 px-3.5 py-2.5 font-mono text-[10px] text-emerald-300">
                    <AppIcon icon={CheckmarkCircle02Icon} size={13} />
                    {success}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

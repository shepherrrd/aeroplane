import { Add01Icon, Alert02Icon, CheckmarkBadge01Icon, CopyCheckIcon, CopyIcon, Globe02Icon, Refresh03Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { api, type DnsProviderId, type DnsProviderStatus, type Domain } from "../../api";
import { AppIcon, FormInput, SectionTitle, StatusPill, shellButton } from "../../components/ui/primitives";
import { DomainDnsProviderActions } from "./domain-dns-provider-actions";

export function ServiceDomainsPanel({
  serviceId,
  domains,
  publicIp,
  busy,
  doAction,
  loadOverview
}: {
  serviceId: string;
  domains: Domain[];
  publicIp?: string;
  busy: string;
  doAction: (label: string, action: () => Promise<void>) => Promise<void>;
  loadOverview: () => Promise<void>;
}) {
  const [domainForm, setDomainForm] = useState({ hostname: "" });
  const [expandedDomainId, setExpandedDomainId] = useState<string | null>(null);
  const [copiedIpDomainId, setCopiedIpDomainId] = useState<string | null>(null);
  const [editingDomainId, setEditingDomainId] = useState<string | null>(null);
  const [editingHostname, setEditingHostname] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [refreshingDns, setRefreshingDns] = useState(false);
  const [connectedDnsProviders, setConnectedDnsProviders] = useState<DnsProviderStatus[]>([]);
  const [dnsProviderBusyId, setDnsProviderBusyId] = useState<DnsProviderId | null>(null);
  const [dnsActionNotice, setDnsActionNotice] = useState<{ domainId: string; tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadDnsProviders() {
      try {
        const response = await api.dnsSettings();
        if (!ignore) setConnectedDnsProviders(response.dns.providers.filter((provider) => provider.connected));
      } catch (error) {
        console.error("Failed to load connected DNS providers:", error);
      }
    }

    void loadDnsProviders();
    return () => {
      ignore = true;
    };
  }, []);

  async function copyIp(event: MouseEvent, domainId: string, targetIp: string) {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(targetIp);
      setCopiedIpDomainId(domainId);
      setTimeout(() => setCopiedIpDomainId(null), 1500);
    } catch (issue) {
      console.error("Failed to copy IP:", issue);
    }
  }

  async function applyDnsRecord(domain: Domain, providerId: DnsProviderId) {
    const provider = connectedDnsProviders.find((item) => item.id === providerId);
    setDnsProviderBusyId(providerId);
    setDnsActionNotice(null);

    try {
      const response = await api.applyDnsRecord(serviceId, domain.id, providerId);
      const actionLabel = response.result.action === "created" ? "Added" : "Updated";
      setDnsActionNotice({
        domainId: domain.id,
        tone: "success",
        text: `${actionLabel} A record in ${provider?.name ?? response.result.providerName}.`
      });
      await loadOverview();
    } catch (error) {
      setDnsActionNotice({
        domainId: domain.id,
        tone: "error",
        text: error instanceof Error ? error.message : `Could not update ${provider?.name ?? "DNS provider"}.`
      });
    } finally {
      setDnsProviderBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/90 pb-5">
        <SectionTitle icon={Globe02Icon} title="Custom Domains" meta="Point public custom domains to this service and configure DNS records." />
        {!showAddForm && (
          <button
            type="button"
            className={shellButton("primary")}
            onClick={() => {
              setShowAddForm(true);
              setDomainForm({ hostname: "" });
            }}
          >
            <AppIcon icon={Add01Icon} size={16} />
            Add Domain
          </button>
        )}
      </div>

      {showAddForm ? (
        <form
          className="w-full space-y-4 border border-zinc-700 bg-zinc-900/60 p-5 transition-all duration-200"
          onSubmit={(event) => {
            event.preventDefault();
            void doAction("domain", async () => {
              await api.addDomain(serviceId, domainForm);
              setDomainForm({ hostname: "" });
              setShowAddForm(false);
            });
          }}
        >
          <SectionTitle icon={Add01Icon} title="Add Custom Domain" meta="Input your registered domain name below." />
          <div className="mt-4 flex items-end gap-3">
            <div className="flex-1">
              <FormInput value={domainForm.hostname} onChange={(event) => setDomainForm({ hostname: event.target.value })} placeholder="app.example.com" required />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button type="submit" className={`${shellButton("primary")} !h-10 !px-4`} disabled={busy === "domain"}>
                Save
              </button>
              <button type="button" className={`${shellButton("ghost")} !h-10 !px-4`} onClick={() => setShowAddForm(false)}>
                Cancel
              </button>
            </div>
          </div>
        </form>
      ) : null}

      {domains.length === 0 ? (
        <div className="rounded border border-dashed border-zinc-800 bg-zinc-950/20 p-8 text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full border border-zinc-850 bg-zinc-900 text-zinc-500">
            <AppIcon icon={Globe02Icon} size={20} />
          </div>
          <h3 className="text-sm font-semibold text-zinc-300">No custom domains configured</h3>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-zinc-500">
            Add a public custom domain name to route internet traffic directly to this service with automatic SSL certificates.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {domains.map((domain) => {
            const isExpanded = expandedDomainId === domain.id;
            const parts = domain.hostname.split(".");
            const isSub = parts.length > 2;
            const hostName = isSub ? parts.slice(0, -2).join(".") : "@";
            const targetIp = publicIp ?? "127.0.0.1";
            const isCopied = copiedIpDomainId === domain.id;
            const isEditing = editingDomainId === domain.id;
            const isLocal = domain.hostname.endsWith(".localhost") || domain.hostname === "localhost" || domain.hostname === "127.0.0.1";

            return (
              <div
                key={domain.id}
                className={`overflow-hidden border border-zinc-700 bg-zinc-900/88 transition-all duration-200 ${
                  isLocal || isEditing ? "" : "cursor-pointer hover:border-zinc-500"
                }`}
                onClick={() => {
                  if (!isLocal && !isEditing) setExpandedDomainId(isExpanded ? null : domain.id);
                }}
              >
                <div className="flex select-none items-center justify-between px-5 py-4">
                  {isEditing ? (
                    <form
                      className="flex flex-1 items-center gap-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void doAction("domain", async () => {
                          await api.updateDomain(serviceId, domain.id, { hostname: editingHostname });
                          setEditingDomainId(null);
                        });
                      }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="min-w-0 flex-1">
                        <input
                          type="text"
                          value={editingHostname}
                          onChange={(event) => setEditingHostname(event.target.value)}
                          className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 font-mono text-xs text-zinc-100 focus:border-[#4FB8B2]/50 focus:outline-none"
                          required
                          placeholder="app.example.com"
                        />
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button type="submit" className={`${shellButton("primary")} !h-8 !px-3 text-xs font-semibold`} disabled={busy === "domain"}>
                          Save
                        </button>
                        <button type="button" className={`${shellButton("ghost")} !h-8 !px-3 text-xs`} onClick={() => setEditingDomainId(null)}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div>
                        <a
                          href={isLocal ? `http://${domain.hostname}` : `https://${domain.hostname}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex w-fit items-center gap-2 font-mono text-sm font-semibold text-zinc-100 transition-colors hover:text-[#4FB8B2]"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <AppIcon icon={Globe02Icon} size={15} className="text-[#4FB8B2]" />
                          {domain.hostname}
                        </a>
                        <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                          <span>{isLocal ? "Local loopback DNS" : "Public custom domain"}</span>
                          {!isLocal && (
                            <span className="border border-[#4FB8B2]/30 px-1 py-0.2 text-[9px] text-[#4FB8B2]/80">
                              {isExpanded ? "Click to collapse" : "Click to configure"}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusPill status={domain.status} />
                        <button
                          type="button"
                          className={shellButton("ghost")}
                          onClick={(event) => {
                            event.stopPropagation();
                            setEditingDomainId(domain.id);
                            setEditingHostname(domain.hostname);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={shellButton("ghost")}
                          onClick={(event) => {
                            event.stopPropagation();
                            void doAction("domain", async () => void api.deleteDomain(serviceId, domain.id));
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {isExpanded ? (
                  <div className="space-y-4 border-t border-zinc-800 bg-zinc-950/45 p-5 font-sans" onClick={(event) => event.stopPropagation()}>
                    <div className="flex flex-col gap-1.5">
                      <h4 className="flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-zinc-300">
                        {domain.status === "active" ? (
                          <>
                            <AppIcon icon={CheckmarkBadge01Icon} size={15} className="text-emerald-400" />
                            <span>DNS Configured Correctly</span>
                          </>
                        ) : (
                          <>
                            <AppIcon icon={Alert02Icon} size={15} className="animate-pulse text-amber-500" />
                            <span>DNS Configuration Required</span>
                          </>
                        )}
                      </h4>
                      <p className="text-xs leading-relaxed text-zinc-400">
                        To route public internet traffic to your self-hosted service, configure an A Record at your domain registrar using these details:
                      </p>
                    </div>

                    <div className="overflow-hidden rounded border border-zinc-800 bg-zinc-900/10 font-mono text-xs">
                      <div className="grid grid-cols-[60px_170px_1fr_80px] border-b border-zinc-800 bg-zinc-900/60 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                        <div>Type</div>
                        <div>Host</div>
                        <div>Points To</div>
                        <div className="text-right">Status</div>
                      </div>
                      <div className="grid grid-cols-[60px_170px_1fr_80px] items-center px-4 py-3 text-zinc-300">
                        <div className="font-semibold text-[#4FB8B2]">A</div>
                        <div className="w-fit max-w-[150px] truncate whitespace-nowrap rounded border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 text-[10px] font-bold" title={hostName}>
                          {hostName}
                        </div>
                        <div className="flex select-all items-center gap-2 truncate pr-4 font-semibold text-zinc-100">
                          {targetIp}
                          <button
                            type="button"
                            onClick={(event) => void copyIp(event, domain.id, targetIp)}
                            className="p-0.5 text-zinc-500 transition-colors hover:text-zinc-300"
                            title={isCopied ? "Copied!" : "Copy IP Address"}
                          >
                            <AppIcon icon={isCopied ? CopyCheckIcon : CopyIcon} size={13} />
                          </button>
                        </div>
                        <div className="flex items-center justify-end text-right text-[11px] font-semibold">
                          {domain.status === "active" ? <span className="text-emerald-400">Active</span> : <span className="animate-pulse text-amber-500">Pending</span>}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-col gap-4 border-t border-zinc-800/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1 space-y-2">
                        <span className="block max-w-sm font-mono text-[10px] leading-relaxed text-zinc-500">
                          {domain.status === "active"
                            ? "Perfect. Caddy reverse-proxy SSL/TLS certificates will automatically renew natively."
                            : "DNS propagation can take a few minutes. Click verify to check again."}
                        </span>
                        <DomainDnsProviderActions
                          providers={connectedDnsProviders}
                          busyProviderId={dnsProviderBusyId}
                          onApply={(providerId) => void applyDnsRecord(domain, providerId)}
                        />
                        {dnsActionNotice?.domainId === domain.id ? (
                          <div
                            className={`w-fit border px-2.5 py-1.5 font-mono text-[10px] ${
                              dnsActionNotice.tone === "success"
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                : "border-rose-500/35 bg-rose-950/25 text-rose-200"
                            }`}
                          >
                            {dnsActionNotice.text}
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 border border-zinc-700 bg-zinc-900 px-3.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-55"
                        onClick={async () => {
                          setRefreshingDns(true);
                          try {
                            await loadOverview();
                          } finally {
                            setRefreshingDns(false);
                          }
                        }}
                        disabled={refreshingDns}
                      >
                        <AppIcon icon={Refresh03Icon} size={13} className={refreshingDns ? "animate-spin" : ""} /> Refresh & Verify
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

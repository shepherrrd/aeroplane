import { CopyCheckIcon, CopyIcon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { AppIcon } from "../../components/ui/primitives";
import { normalizeRootDomain, wildcardRootDomain } from "../../lib/root-domain";

export function RootDomainInstructions({ rootDomain, publicIp }: { rootDomain: string; publicIp: string }) {
  const [copied, setCopied] = useState(false);
  const normalizedDomain = normalizeRootDomain(rootDomain);
  const wildcardHostname = wildcardRootDomain(rootDomain) || "*.pilot.aeroplane.run";

  async function copyIp() {
    try {
      await navigator.clipboard.writeText(publicIp);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-5 border border-zinc-800 bg-zinc-950/50">
      <div className="border-b border-zinc-800 px-4 py-3">
        <h3 className="font-hero text-sm tracking-tight text-zinc-100">DNS setup instructions</h3>
        <p className="mt-1 font-mono text-[11px] leading-relaxed text-zinc-500">
          Add one wildcard A record wherever this domain is managed.
        </p>
      </div>

      <div className="grid border-b border-zinc-800 font-mono text-[11px] sm:grid-cols-[110px_minmax(0,1fr)]">
        <div className="border-b border-zinc-800 px-4 py-3 uppercase tracking-[0.18em] text-zinc-600 sm:border-b-0 sm:border-r">Type</div>
        <div className="px-4 py-3 font-semibold text-zinc-100">A</div>
      </div>
      <div className="grid border-b border-zinc-800 font-mono text-[11px] sm:grid-cols-[110px_minmax(0,1fr)]">
        <div className="border-b border-zinc-800 px-4 py-3 uppercase tracking-[0.18em] text-zinc-600 sm:border-b-0 sm:border-r">Host</div>
        <div className="px-4 py-3">
          <div className="font-semibold text-[#7fe3dd]">{wildcardHostname}</div>
          <div className="mt-1 text-[10px] text-zinc-500">This matches generated service URLs like api.{normalizedDomain || "pilot.aeroplane.run"}.</div>
        </div>
      </div>
      <div className="grid font-mono text-[11px] sm:grid-cols-[110px_minmax(0,1fr)]">
        <div className="border-b border-zinc-800 px-4 py-3 uppercase tracking-[0.18em] text-zinc-600 sm:border-b-0 sm:border-r">Value</div>
        <div className="flex min-w-0 items-center gap-2 px-4 py-3">
          <span className="truncate font-semibold text-zinc-100">{publicIp || "Your server IP"}</span>
          {publicIp ? (
            <button type="button" onClick={() => void copyIp()} className="shrink-0 p-0.5 text-zinc-500 transition hover:text-zinc-100" title={copied ? "Copied" : "Copy IP"}>
              <AppIcon icon={copied ? CopyCheckIcon : CopyIcon} size={13} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

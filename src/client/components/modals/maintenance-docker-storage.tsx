import type { SystemMaintenanceInfo } from "../../api";
import { formatBytes } from "../../lib/format";
import { statusClass } from "../ui/primitives";

export function MaintenanceDockerStorage({
  info,
  loading,
  dockerMax
}: {
  info: SystemMaintenanceInfo | null;
  loading: boolean;
  dockerMax: number;
}) {
  return (
    <div className="border border-zinc-800 bg-zinc-950/45">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <h4 className="font-hero text-base tracking-tight text-zinc-100">Docker storage</h4>
        <span className={`px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] ${info?.docker.available ? statusClass("active") : statusClass("failed")}`}>
          {info?.docker.available ? "Available" : "Unavailable"}
        </span>
      </div>
      <div className="divide-y divide-zinc-800">
        {(info?.docker.rows ?? []).length > 0 ? (
          info?.docker.rows.map((row) => {
            const percent = Math.max(2, Math.min(100, ((row.sizeBytes ?? 0) / dockerMax) * 100));
            const reclaimable = row.reclaimableBytes ?? 0;

            return (
              <div key={row.type} className="grid gap-3 px-4 py-3 md:grid-cols-[160px_minmax(0,1fr)_240px] md:items-center">
                <div>
                  <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{row.type}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {row.activeCount ?? "?"}/{row.totalCount ?? "?"} active
                  </div>
                </div>
                <div className="h-2 border border-zinc-800 bg-black/45">
                  <div className="h-full bg-zinc-500" style={{ width: `${percent}%` }} />
                </div>
                <div className="font-mono text-xs text-zinc-300">
                  {formatBytes(row.sizeBytes)}
                  <span className={`ml-2 ${reclaimable > 0 ? "text-amber-200" : "text-zinc-600"}`}>{formatBytes(row.reclaimableBytes)} candidate</span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="grid min-h-28 place-items-center px-4 py-8 text-sm text-zinc-500">{loading ? "Loading Docker usage..." : "No Docker usage data."}</div>
        )}
      </div>
      {info?.docker.available && info.docker.reclaimableBytes > 0 ? (
        <div className="border-t border-zinc-800 px-4 py-3 text-xs leading-relaxed text-zinc-500">
          Docker can keep image layers listed as candidates after safe cleanup when running services still reference them.
        </div>
      ) : null}
    </div>
  );
}

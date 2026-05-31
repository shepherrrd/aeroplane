export function MaintenanceUsageBar({
  label,
  value,
  detail,
  percent,
  tone = "teal"
}: {
  label: string;
  value: string;
  detail?: string;
  percent: number;
  tone?: "teal" | "amber" | "rose" | "zinc";
}) {
  const clampedPercent = Math.max(0, Math.min(100, percent));
  const color =
    tone === "rose"
      ? "bg-rose-400"
      : tone === "amber"
        ? "bg-amber-300"
        : tone === "zinc"
          ? "bg-zinc-400"
          : "bg-[#4FB8B2]";

  return (
    <div className="border border-zinc-800 bg-zinc-950/45 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">{label}</div>
          <div className="mt-2 font-hero text-xl tracking-tight text-zinc-100">{value}</div>
        </div>
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{Math.round(clampedPercent)}%</div>
      </div>
      <div className="mt-4 h-2 border border-zinc-800 bg-black/45">
        <div className={`h-full ${color}`} style={{ width: `${clampedPercent}%` }} />
      </div>
      {detail ? <p className="mt-3 text-xs leading-relaxed text-zinc-500">{detail}</p> : null}
    </div>
  );
}

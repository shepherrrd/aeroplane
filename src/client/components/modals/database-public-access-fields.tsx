import { Globe02Icon } from "@hugeicons/core-free-icons";
import { AppIcon, FieldLabel } from "../ui/primitives";

type DatabasePublicAccessFieldsProps = {
  enabled: boolean;
  hostname: string;
  hostPort?: number;
  rootDomain?: string;
  disabled?: boolean;
  redeployHint?: boolean;
  onEnabledChange: (enabled: boolean) => void;
};

export function DatabasePublicAccessFields({
  enabled,
  hostname,
  hostPort,
  rootDomain,
  disabled,
  redeployHint,
  onEnabledChange
}: DatabasePublicAccessFieldsProps) {
  const connectionTarget = hostname
    ? `${hostname}:${hostPort ?? "<port>"}`
    : rootDomain
      ? `db.${rootDomain}:${hostPort ?? "<port>"}`
      : `db.example.com:${hostPort ?? "<port>"}`;

  return (
    <div className="space-y-4 border border-zinc-800 bg-zinc-950/35 p-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
          disabled={disabled}
          className="mt-1 h-4 w-4 accent-[#4FB8B2]"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm font-medium text-zinc-100">
            <AppIcon icon={Globe02Icon} size={15} />
            Public TCP hostname
          </span>
          <span className="mt-1 block text-xs leading-5 text-zinc-400">
            Off keeps the database private on the Aeroplane runtime network. On exposes the assigned host port and generates <code>DATABASE_PUBLIC_URL</code>.
          </span>
        </span>
      </label>

      {enabled ? (
        <>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <div>
              <FieldLabel>Generated hostname</FieldLabel>
              <div className="flex h-11 min-w-0 items-center border border-zinc-800 bg-zinc-950 px-3 font-mono text-xs text-zinc-100">
                <span className="truncate">{hostname || "Set root domain first"}</span>
              </div>
            </div>
            <div>
              <FieldLabel>Connection target</FieldLabel>
              <div className="flex h-11 min-w-0 items-center border border-zinc-800 bg-zinc-950 px-3 font-mono text-xs text-[#7fe3dd]">
                <span className="truncate">{connectionTarget}</span>
              </div>
            </div>
          </div>
          {redeployHint ? (
            <p className="text-xs leading-5 text-zinc-400">
              Save settings, then redeploy this database to apply the public port binding to the running container.
            </p>
          ) : null}
        </>
      ) : (
        <div className="border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
          Private internal URLs will still use the service hostname inside Aeroplane.
        </div>
      )}
    </div>
  );
}

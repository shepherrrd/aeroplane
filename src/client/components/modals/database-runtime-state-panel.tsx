import { Alert02Icon, Clock01Icon, DatabaseIcon, DatabaseSync01Icon, Refresh03Icon } from "@hugeicons/core-free-icons";
import type { DatabaseRuntimeState } from "../../api";
import { AppIcon, shellButton } from "../ui/primitives";

type DatabaseRuntimeStatePanelProps = {
  state: Exclude<DatabaseRuntimeState, "ready">;
  message?: string;
  busy?: boolean;
  onRefresh: () => void;
};

const runtimeStateCopy: Record<Exclude<DatabaseRuntimeState, "ready">, { title: string; fallback: string; icon: unknown; accent: string }> = {
  deploying: {
    title: "Database is deploying",
    fallback: "Data will be available once the container is running.",
    icon: DatabaseSync01Icon,
    accent: "border-amber-500/35 bg-amber-500/10 text-amber-200"
  },
  idle: {
    title: "Database is idle",
    fallback: "Deploy this service before browsing its data.",
    icon: Clock01Icon,
    accent: "border-zinc-700 bg-zinc-900/80 text-zinc-300"
  },
  failed: {
    title: "Database deployment failed",
    fallback: "Check the deployment logs, then retry the deployment.",
    icon: Alert02Icon,
    accent: "border-rose-500/35 bg-rose-500/10 text-rose-200"
  },
  unavailable: {
    title: "Database runtime unavailable",
    fallback: "Deploy or refresh the service, then try again.",
    icon: DatabaseIcon,
    accent: "border-orange-500/35 bg-orange-500/10 text-orange-200"
  }
};

export function DatabaseRuntimeStatePanel({ state, message, busy = false, onRefresh }: DatabaseRuntimeStatePanelProps) {
  const copy = runtimeStateCopy[state];

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center border border-zinc-800 bg-zinc-950/45 px-5 py-8 text-center">
      <div className="flex max-w-md flex-col items-center">
        <div className={`mb-4 grid h-11 w-11 place-items-center border ${copy.accent}`}>
          <AppIcon icon={copy.icon} size={19} className={state === "deploying" ? "animate-pulse" : ""} />
        </div>
        <h3 className="font-hero text-lg text-zinc-100">{copy.title}</h3>
        <p className="mt-2 text-sm leading-6 text-zinc-400">{message || copy.fallback}</p>
        <button type="button" className={`${shellButton("secondary")} mt-5 h-9 !py-0`} onClick={onRefresh} disabled={busy}>
          <AppIcon icon={Refresh03Icon} size={15} className={busy ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>
    </div>
  );
}

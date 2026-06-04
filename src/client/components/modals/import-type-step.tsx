import { ArrowLeft01Icon, CloudServerIcon, GithubIcon, PackageIcon } from "@hugeicons/core-free-icons";
import { AppIcon } from "../ui/primitives";

type ServiceType = "git" | "database" | "docker-image";

type ServiceTypeOption = {
  key: ServiceType;
  name: string;
  icon: unknown;
};

const SERVICE_TYPE_OPTIONS: ServiceTypeOption[] = [
  {
    key: "git",
    name: "Git Repository",
    icon: GithubIcon
  },
  {
    key: "database",
    name: "Database",
    icon: CloudServerIcon
  },
  {
    key: "docker-image",
    name: "Docker Image",
    icon: PackageIcon
  }
];

export function ImportTypeStep({ onSelect }: { onSelect: (type: ServiceType) => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center px-1 py-6">
      <div className="mb-6 shrink-0">
        <h3 className="font-hero text-xl font-bold tracking-tight text-zinc-100">Select service type</h3>
        <p className="mt-2 font-mono text-xs uppercase tracking-widest text-zinc-400">Choose the source of your deployment</p>
      </div>

      <div className="mx-auto w-full max-w-2xl overflow-hidden border border-zinc-800 bg-zinc-900/45">
        {SERVICE_TYPE_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => onSelect(option.key)}
            className="group grid w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-4 border-b border-zinc-800 px-4 py-3.5 text-left transition last:border-b-0 hover:border-[#4FB8B2]/25 hover:bg-[#4FB8B2]/6 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-[#4FB8B2]/45"
          >
            <span className="grid h-11 w-11 place-items-center border border-zinc-800 bg-zinc-950 text-zinc-300 transition group-hover:border-[#4FB8B2]/40 group-hover:bg-[#4FB8B2]/10 group-hover:text-[#7fe3dd]">
              <AppIcon icon={option.icon} size={20} />
            </span>
            <span className="min-w-0 truncate font-hero text-base font-bold text-zinc-100 transition group-hover:text-[#7fe3dd]">{option.name}</span>
            <span className="grid h-8 w-8 place-items-center border border-zinc-800 text-zinc-500 transition group-hover:border-[#4FB8B2]/30 group-hover:text-[#7fe3dd]">
              <AppIcon icon={ArrowLeft01Icon} size={15} className="rotate-180" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

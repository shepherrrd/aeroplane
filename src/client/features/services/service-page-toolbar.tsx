import { ArrowDown01Icon, ArrowLeft01Icon, CloudServerIcon, GithubIcon, PackageIcon } from "@hugeicons/core-free-icons";
import { useEffect, useRef, useState } from "react";
import type { Service } from "../../api";
import { AppIcon, FrameworkMark } from "../../components/ui/primitives";
import { isDatabaseService, isDockerImageService } from "../../../shared/service-source";

export function ServicePageToolbar({
  services,
  currentService,
  onBack,
  onServiceSelect
}: {
  services: Service[];
  currentService: Service | null;
  onBack: () => void;
  onServiceSelect: (serviceSlug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const otherServices = services.filter((service) => service.id !== currentService?.id);
  const currentIsDatabase = currentService ? isDatabaseService(currentService) : false;
  const currentIsDockerImage = currentService ? isDockerImageService(currentService) : false;

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center border border-zinc-700 bg-zinc-950/70 text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-900 hover:text-white"
          onClick={onBack}
          aria-label="Back to project"
        >
          <AppIcon icon={ArrowLeft01Icon} size={15} />
        </button>

        <div ref={menuRef} className="relative min-w-0">
          <button
            type="button"
            className="inline-flex h-9 max-w-[340px] items-center justify-center gap-2 border border-zinc-700 bg-zinc-950/70 px-3 text-sm text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-900"
            onClick={() => setOpen((current) => !current)}
          >
            <span className="grid h-5 w-5 flex-none place-items-center overflow-hidden">
              <FrameworkMark framework={currentService?.framework ?? null} size={18} fallback={<AppIcon icon={currentIsDatabase ? CloudServerIcon : currentIsDockerImage ? PackageIcon : GithubIcon} size={16} />} />
            </span>
            <span className="min-w-0 truncate">{currentService?.name ?? "Select service"}</span>
            <AppIcon icon={ArrowDown01Icon} size={14} className={open ? "rotate-180" : ""} />
          </button>

          {open ? (
            <div className="absolute left-0 top-full z-30 mt-2 w-[320px] max-w-[calc(100vw-2rem)] border border-zinc-700 bg-zinc-950 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
              <div className="border-b border-zinc-800 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Switch service</div>
              <div className="max-h-80 overflow-y-auto p-1.5">
                {otherServices.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-zinc-500">No other services in this project.</div>
                ) : (
                  otherServices.map((service) => {
                    const isDatabase = isDatabaseService(service);
                    const isDockerImage = isDockerImageService(service);
                    return (
                      <button
                        key={service.id}
                        type="button"
                        className="flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left text-sm text-zinc-200 transition hover:bg-zinc-900 hover:text-white"
                        onClick={() => {
                          setOpen(false);
                          onServiceSelect(service.slug);
                        }}
                      >
                        <span className="grid h-6 w-6 flex-none place-items-center overflow-hidden border border-zinc-800 bg-zinc-900 p-1">
                          <FrameworkMark framework={service.framework} size={16} fallback={<AppIcon icon={isDatabase ? CloudServerIcon : isDockerImage ? PackageIcon : GithubIcon} size={14} />} />
                        </span>
                        <span className="min-w-0 flex-1 truncate">{service.name}</span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">{service.status}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

import type { ReactNode } from "react";
import { SectionTitle, shellButton, surfaceClass } from "../ui/primitives";

export function ModalShell({
  open,
  title,
  meta,
  icon,
  onClose,
  children,
  width = "max-w-3xl",
  bodyClassName = "min-h-0 flex-1 overflow-y-auto pr-1"
}: {
  open: boolean;
  title: string;
  meta?: string;
  icon: unknown;
  onClose: () => void;
  children: ReactNode;
  width?: string;
  bodyClassName?: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/45 p-4 backdrop-blur-sm">
      <div className="mx-auto flex min-h-full items-center justify-center">
        <div className={`${surfaceClass(`flex max-h-[min(720px,calc(100vh-2rem))] min-h-[420px] w-full ${width} flex-col p-6 md:p-7`)}`}>
          <div className="mb-6 flex items-start justify-between gap-4 border-b border-zinc-800/90 pb-5">
            <SectionTitle icon={icon} title={title} meta={meta} />
            <button type="button" className={shellButton("ghost")} onClick={onClose}>
              Close
            </button>
          </div>
          <div className={bodyClassName}>{children}</div>
        </div>
      </div>
    </div>
  );
}

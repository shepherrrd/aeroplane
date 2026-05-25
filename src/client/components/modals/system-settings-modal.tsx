import { Globe02Icon, Refresh03Icon, Settings01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { AppIcon, SectionTitle, shellButton, surfaceClass } from "../ui/primitives";
import { RootDomainSettingsPanel } from "./root-domain-settings-panel";
import { UpdatesSettingsPanel } from "./updates-settings-panel";

type SettingsTab = "root-domain" | "updates";

const settingsTabs: Array<{ id: SettingsTab; label: string; icon: unknown }> = [
  { id: "root-domain", label: "Root Domain", icon: Globe02Icon },
  { id: "updates", label: "Updates", icon: Refresh03Icon }
];

export function SystemSettingsModal({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("root-domain");

  useEffect(() => {
    if (open) {
      setActiveTab("root-domain");
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/45 p-4 backdrop-blur-sm">
      <div className="mx-auto flex min-h-full max-w-[94%] items-center justify-center lg:max-w-7xl">
        <div className={surfaceClass("flex h-[min(900px,calc(100vh-2rem))] min-h-[640px] w-full flex-col p-6 md:p-8")}>
          <div className="mb-6 flex items-start justify-between gap-4 border-b border-zinc-800/90 pb-5">
            <SectionTitle icon={Settings01Icon} title="System Settings" meta="Configure global infrastructure, routing, and updates." />
            <button type="button" className={shellButton("ghost")} onClick={onClose}>
              Close
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="grid h-full gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
              <aside className="space-y-1 border-r border-zinc-800/80 pr-6">
                {settingsTabs.map((tab) => {
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      className={
                        active
                          ? "flex w-full items-center gap-2.5 border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-left font-mono text-xs font-semibold uppercase tracking-wider text-[#4FB8B2]"
                          : "flex w-full items-center gap-2.5 border border-transparent px-3 py-2.5 text-left font-mono text-xs font-semibold uppercase tracking-wider text-zinc-500 transition hover:border-zinc-800 hover:bg-zinc-900/55 hover:text-zinc-200"
                      }
                      onClick={() => setActiveTab(tab.id)}
                    >
                      <AppIcon icon={tab.icon} size={15} />
                      {tab.label}
                    </button>
                  );
                })}
              </aside>

              <div>{activeTab === "root-domain" ? <RootDomainSettingsPanel open={open} /> : <UpdatesSettingsPanel open={open} />}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

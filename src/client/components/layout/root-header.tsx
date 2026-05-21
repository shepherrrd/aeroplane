import { Link } from "@tanstack/react-router";
import { AddSquareIcon, WorkflowSquare07Icon } from "@hugeicons/core-free-icons";
import type { ToolCheck } from "../../api";
import { AppIcon, shellButton } from "../ui/primitives";

export function RootHeader({
  tools,
  onCreateProject
}: {
  tools: ToolCheck[];
  onCreateProject?: () => void;
}) {
  return (
    <header className="border-b border-neutral-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-4 md:px-8">
        <Link to="/" className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-neutral-950 text-white">
            <AppIcon icon={WorkflowSquare07Icon} size={18} />
          </div>
          <div>
            <div className="text-base font-medium tracking-tight text-neutral-950">Deploy</div>
            <div className="text-sm text-neutral-500">projects, services, domains</div>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 md:flex">
            {tools.slice(0, 4).map((tool) => (
              <div key={tool.name} className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
                <span className={`h-2 w-2 rounded-full ${tool.ok ? "bg-neutral-950" : "bg-neutral-300"}`} />
                {tool.name}
              </div>
            ))}
          </div>
          {onCreateProject ? (
            <button type="button" className={shellButton("primary")} onClick={onCreateProject}>
              <AppIcon icon={AddSquareIcon} size={16} />
              New project
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

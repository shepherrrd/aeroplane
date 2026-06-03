import { SkeletonBlock, SkeletonText } from "../../components/ui/skeleton";

function ServiceCardSkeleton() {
  return (
    <article className="border border-zinc-800 bg-zinc-950/60 p-5">
      <div className="flex items-start gap-4">
        <SkeletonBlock className="h-12 w-12 shrink-0 border border-zinc-700" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <SkeletonBlock className="h-6 w-36" />
              <SkeletonBlock className="mt-2 h-4 w-48 max-w-full" />
            </div>
            <SkeletonBlock className="h-7 w-20 shrink-0" />
          </div>
        </div>
      </div>

      <SkeletonBlock className="mt-5 h-8 w-44 max-w-full" />
      <SkeletonBlock className="mt-4 h-4 w-56 max-w-full" />
      <div className="mt-4 flex gap-2">
        <SkeletonBlock className="h-3 w-24" />
        <SkeletonBlock className="h-3 w-12" />
        <SkeletonBlock className="h-3 w-20" />
      </div>
    </article>
  );
}

export function ProjectPageSkeleton() {
  return (
    <div role="status" aria-label="Loading project" className="contents">
      <span className="sr-only">Loading project</span>
      <section className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <SkeletonBlock className="h-9 w-9 border border-zinc-700" />
            <SkeletonBlock className="h-9 w-52 max-w-full border border-zinc-700" />
          </div>
          <div className="mt-4 max-w-2xl">
            <SkeletonBlock className="h-10 w-72 max-w-full" />
            <div className="mt-3 max-w-xl">
              <SkeletonText rows={2} widths={["w-full", "w-4/5"]} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-10 w-36 border border-[#4FB8B2]/25" />
          <SkeletonBlock className="h-10 w-10 border border-zinc-700" />
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <ServiceCardSkeleton key={index} />
        ))}
      </section>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { api, type FrameworkIconAsset } from "../api";
import { frameworkIconClassName } from "../components/ui/framework-icon-colors";
import { StatusPill } from "../components/ui/primitives";

function iconFallback(name: string) {
  return name
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function SvgsPage() {
  const [icons, setIcons] = useState<FrameworkIconAsset[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    api.frameworkIcons()
      .then((result) => {
        if (!cancelled) setIcons(result.icons);
      })
      .catch((issue) => {
        if (!cancelled) setError(issue instanceof Error ? issue.message : "Could not load SVG icons");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const groupedIcons = useMemo(() => {
    return {
      framework: icons.filter((icon) => icon.category === "framework"),
      database: icons.filter((icon) => icon.category === "database")
    };
  }, [icons]);

  return (
    <main className="relative min-h-dvh overflow-hidden bg-zinc-950 px-5 py-8 text-zinc-100 sm:px-8 lg:px-12">
      <div aria-hidden className="hero-noise pointer-events-none absolute inset-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:64px_64px]"
      />

      <div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-8">
        <header className="flex flex-col gap-4 border-b border-zinc-800 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-[#7fe3dd]">Icon Gallery</p>
            <h1 className="mt-3 font-hero text-5xl tracking-tight text-zinc-50 md:text-7xl">SVGs</h1>
            <p className="mt-3 max-w-2xl text-sm text-zinc-400">
              Checked-in framework and database SVGs served by Aeroplane.
            </p>
          </div>
          <div className="flex gap-3">
            <StatusPill status={`${icons.length} icons`} />
            <StatusPill status="local assets" />
          </div>
        </header>

        {error ? (
          <div className="border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
        ) : null}

        <IconSection title="Frameworks" icons={groupedIcons.framework} />
        <IconSection title="Databases" icons={groupedIcons.database} />
      </div>
    </main>
  );
}

function IconSection({ icons, title }: { icons: FrameworkIconAsset[]; title: string }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
        <h2 className="font-hero text-2xl tracking-tight text-zinc-100">{title}</h2>
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-500">{icons.length}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {icons.map((icon) => (
          <a
            key={icon.slug}
            href={icon.logoUrl ?? undefined}
            target="_blank"
            rel="noreferrer"
            className="group flex min-h-32 flex-col gap-4 border border-zinc-800 bg-zinc-950/70 p-4 transition hover:border-[#4FB8B2]/45 hover:bg-zinc-900/80"
          >
            <div className="grid grid-cols-2 gap-2">
              <IconPreview icon={icon} tone="dark" />
              <IconPreview icon={icon} tone="light" />
            </div>
            <div className="min-w-0 text-left">
              <div className="truncate text-sm font-semibold text-zinc-100">{icon.name}</div>
              <div className="mt-1 truncate font-mono text-[11px] text-zinc-500">{icon.slug}.svg</div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

function IconPreview({ icon, tone }: { icon: FrameworkIconAsset; tone: "dark" | "light" }) {
  const isDark = tone === "dark";

  return (
    <div
      className={
        isDark
          ? "grid h-16 place-items-center border border-zinc-700 bg-zinc-950 p-3"
          : "grid h-16 place-items-center border border-zinc-300 bg-zinc-100 p-3"
      }
    >
      {icon.logoUrl ? (
        <img
          src={icon.logoUrl}
          alt={`${icon.name} on ${tone}`}
          className={`max-h-11 max-w-full object-contain ${frameworkIconClassName(icon.slug, isDark)}`.trim()}
          loading="lazy"
        />
      ) : (
        <span className={isDark ? "font-mono text-xs text-zinc-400" : "font-mono text-xs text-zinc-600"}>
          {iconFallback(icon.name)}
        </span>
      )}
    </div>
  );
}

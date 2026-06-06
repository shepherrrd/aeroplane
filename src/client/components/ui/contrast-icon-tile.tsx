import { ReactNode } from "react";

export function ContrastIconTile({
  alt,
  fallback,
  size = 18,
  src
}: {
  alt: string;
  fallback?: ReactNode;
  size?: number;
  src: null | string;
}) {
  const padding = Math.max(Math.round(size * 0.16), 3);
  const imageSize = Math.max(size - padding * 2, 10);

  return (
    <span
      style={{
        background: "linear-gradient(135deg, #f4f4f5 0 50%, #18181b 50% 100%)",
        height: size,
        width: size
      }}
      className="grid shrink-0 place-items-center rounded-[3px] border border-zinc-700/70 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          style={{
            filter: "drop-shadow(0 0 1px rgba(255,255,255,0.95)) drop-shadow(0 0 1px rgba(0,0,0,0.95))",
            maxHeight: imageSize,
            maxWidth: imageSize
          }}
          className="object-contain"
          loading="lazy"
        />
      ) : (
        fallback
      )}
    </span>
  );
}

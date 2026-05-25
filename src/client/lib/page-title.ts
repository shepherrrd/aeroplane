import { useEffect } from "react";

const APP_NAME = "Aeroplane";

function titleFromParts(parts: Array<string | null | undefined>) {
  const cleanParts = parts.map((part) => part?.trim()).filter(Boolean);
  return cleanParts.length > 0 ? `${cleanParts.join(" - ")} - ${APP_NAME}` : APP_NAME;
}

export function usePageTitle(parts: string | Array<string | null | undefined>) {
  useEffect(() => {
    document.title = Array.isArray(parts) ? titleFromParts(parts) : titleFromParts([parts]);
  }, [parts]);
}

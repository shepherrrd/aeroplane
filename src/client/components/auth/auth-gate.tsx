import { useLocation, useNavigate } from "@tanstack/react-router";
import { ReactNode, startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { api, type AuthStatus } from "../../api";
import { BrandMark } from "../ui/brand-mark";

function AuthLoading() {
  return (
    <main className="relative isolate grid min-h-dvh place-items-center overflow-hidden bg-zinc-950 text-zinc-100">
      <div aria-hidden className="hero-noise pointer-events-none absolute inset-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:72px_72px]"
      />
      <div className="relative z-10 flex items-center gap-3 border border-zinc-800 bg-zinc-950/85 px-4 py-3">
        <div className="grid h-9 w-9 place-items-center border border-[#4FB8B2]/35 bg-[#4FB8B2]/10 text-[#4FB8B2]">
          <BrandMark />
        </div>
        <div>
          <div className="font-hero text-sm text-zinc-100">Aeroplane</div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Checking access</div>
        </div>
      </div>
    </main>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    try {
      const nextStatus = await api.authStatus();
      startTransition(() => {
        setStatus(nextStatus);
        setLoading(false);
      });
    } catch {
      startTransition(() => {
        setStatus(null);
        setLoading(false);
      });
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    window.addEventListener("aeroplane-auth-changed", loadStatus);
    return () => window.removeEventListener("aeroplane-auth-changed", loadStatus);
  }, [loadStatus]);

  const redirectTo = useMemo(() => {
    if (!status) return "";
    const pathname = location.pathname;
    if (!status.setupComplete && pathname !== "/onboarding") return "/onboarding";
    if (status.setupComplete && !status.authenticated && pathname !== "/login") return "/login";
    if (status.setupComplete && status.authenticated && pathname === "/login") return "/";
    return "";
  }, [location.pathname, status]);

  useEffect(() => {
    if (!redirectTo) return;
    if (redirectTo === "/onboarding") {
      void navigate({ to: "/onboarding" });
    } else if (redirectTo === "/login") {
      void navigate({ to: "/login" });
    } else {
      void navigate({ to: "/" });
    }
  }, [navigate, redirectTo]);

  if (loading || redirectTo) return <AuthLoading />;

  return <>{children}</>;
}

import { Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { AuthGate } from "../auth/auth-gate";

export function RootShell() {
  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-950">
      <AuthGate>
        <Outlet />
      </AuthGate>
      <TanStackRouterDevtools position="bottom-right" />
    </div>
  );
}

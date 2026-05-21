import { createRootRoute } from "@tanstack/react-router";
import { RootShell } from "../components/layout/root-shell";

export const rootRoute = createRootRoute({
  component: RootShell
});

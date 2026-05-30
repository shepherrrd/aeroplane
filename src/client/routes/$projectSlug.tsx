import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/$projectSlug")({
  component: ProjectLayoutRouteComponent
});

function ProjectLayoutRouteComponent() {
  return <Outlet />;
}

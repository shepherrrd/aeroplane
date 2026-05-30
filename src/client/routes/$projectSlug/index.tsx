import { createFileRoute } from "@tanstack/react-router";
import { ProjectPage } from "../../pages/project-page";

export const Route = createFileRoute("/$projectSlug/")({
  component: ProjectIndexRouteComponent
});

function ProjectIndexRouteComponent() {
  const { projectSlug } = Route.useParams();
  return <ProjectPage projectSlug={projectSlug} />;
}

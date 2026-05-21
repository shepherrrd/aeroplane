import { createRoute } from "@tanstack/react-router";
import { ProjectsPage } from "../pages/projects-page";
import { rootRoute } from "./root";

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ProjectsPage
});

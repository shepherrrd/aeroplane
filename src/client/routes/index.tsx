import { createFileRoute } from "@tanstack/react-router";
import { isSystemSettingsTab, type SystemSettingsTab } from "../components/modals/system-settings-types";
import { ProjectsPage } from "../pages/projects-page";

export const Route = createFileRoute("/")({
  validateSearch: (search): { settings?: SystemSettingsTab } => ({
    settings: isSystemSettingsTab(search.settings) ? search.settings : undefined
  }),
  component: IndexRouteComponent
});

function IndexRouteComponent() {
  const search = Route.useSearch();
  return <ProjectsPage settingsTab={search.settings} />;
}

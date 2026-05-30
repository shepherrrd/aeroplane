import { createFileRoute } from "@tanstack/react-router";
import { ServicePage } from "../../../pages/service-page";

export const Route = createFileRoute("/$projectSlug/$serviceSlug/$serviceTab")({
  component: ServiceTabRouteComponent
});

function ServiceTabRouteComponent() {
  const { projectSlug, serviceSlug, serviceTab } = Route.useParams();
  return <ServicePage projectSlug={projectSlug} serviceSlug={serviceSlug} serviceTab={serviceTab} />;
}

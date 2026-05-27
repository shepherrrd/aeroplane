import { createRoute, useParams } from "@tanstack/react-router";
import { ServicePage } from "../pages/service-page";
import { rootRoute } from "./root";

export const serviceIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$projectSlug/$serviceSlug",
  component: ServiceIndexRouteComponent
});

export const serviceTabRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$projectSlug/$serviceSlug/$serviceTab",
  component: ServiceTabRouteComponent
});

function ServiceIndexRouteComponent() {
  const { projectSlug, serviceSlug } = useParams({ from: serviceIndexRoute.id });
  return <ServicePage projectSlug={projectSlug} serviceSlug={serviceSlug} />;
}

function ServiceTabRouteComponent() {
  const { projectSlug, serviceSlug, serviceTab } = useParams({ from: serviceTabRoute.id });
  return <ServicePage projectSlug={projectSlug} serviceSlug={serviceSlug} serviceTab={serviceTab} />;
}

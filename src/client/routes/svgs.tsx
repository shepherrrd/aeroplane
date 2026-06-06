import { createFileRoute } from "@tanstack/react-router";
import { SvgsPage } from "../pages/svgs-page";

export const Route = createFileRoute("/svgs")({
  component: SvgsPage
});

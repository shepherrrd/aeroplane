import { createRoute } from "@tanstack/react-router";
import { OnboardingSuccessPage } from "../pages/onboarding-success-page";
import { rootRoute } from "./root";

export const onboardingSuccessRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding/success",
  component: OnboardingSuccessPage
});

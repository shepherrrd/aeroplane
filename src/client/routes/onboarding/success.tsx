import { createFileRoute } from "@tanstack/react-router";
import { OnboardingSuccessPage } from "../../pages/onboarding-success-page";

export const Route = createFileRoute("/onboarding/success")({
  component: OnboardingSuccessPage
});

import { useEffect, useState } from "react";
import { api } from "../../api";
import { RootDomainInstructions } from "./root-domain-instructions";
import type { OnboardingForm } from "./onboarding-types";
import { OnboardingSection, TextField } from "./onboarding-fields";

export function RootDomainStep({
  form,
  update
}: {
  form: OnboardingForm;
  update: (patch: Partial<OnboardingForm>) => void;
}) {
  const [publicIp, setPublicIp] = useState("");

  useEffect(() => {
    let cancelled = false;
    void api.authStatus().then((status) => {
      if (!cancelled) setPublicIp(status.publicIp ?? "");
    }).catch(() => {
      if (!cancelled) setPublicIp("");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <OnboardingSection
      eyebrow="Step 04"
      title="Root domain"
      description={
        <>
          Set the root domain Aeroplane should use for automatically generated service hostnames, e.g.{" "}
          <span className="text-[#7fe3dd]">api.pilot.aeroplane.run</span>. You can leave it blank and configure it later.
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Root domain" value={form.rootDomain} onChange={(rootDomain) => update({ rootDomain })} placeholder="pilot.aeroplane.run" />
      </div>
      <RootDomainInstructions rootDomain={form.rootDomain} publicIp={publicIp} />
    </OnboardingSection>
  );
}

import { useEffect, useState } from "react";
import { api } from "../../api";
import { ControlPlaneDomainInstructions } from "./control-plane-domain-instructions";
import { RootDomainInstructions } from "./root-domain-instructions";
import type { OnboardingForm } from "./onboarding-types";
import { OnboardingSection, TextField } from "./onboarding-fields";
import { isWildcardRootDomain } from "../../lib/root-domain";

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
          Set the exact dashboard hostname, then enter the generated service domain as a wildcard, e.g.{" "}
          <span className="text-[#7fe3dd]">*.pilot.aeroplane.run</span>. You can leave either blank and configure it later.
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          label="Dashboard domain"
          value={form.controlPlaneHostname}
          onChange={(controlPlaneHostname) => update({ controlPlaneHostname })}
          placeholder="pilot.aeroplane.run"
        />
        <div>
          <TextField label="Wildcard root domain" value={form.rootDomain} onChange={(rootDomain) => update({ rootDomain })} placeholder="*.pilot.aeroplane.run" />
          {form.rootDomain.trim() && !isWildcardRootDomain(form.rootDomain) ? (
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-rose-300">Include the wildcard prefix, e.g. *.pilot.aeroplane.run.</p>
          ) : (
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-zinc-500">Aeroplane stores the base domain, but asks for the wildcard so DNS setup is explicit.</p>
          )}
        </div>
      </div>
      <ControlPlaneDomainInstructions hostname={form.controlPlaneHostname} publicIp={publicIp} />
      <RootDomainInstructions rootDomain={form.rootDomain} publicIp={publicIp} />
    </OnboardingSection>
  );
}

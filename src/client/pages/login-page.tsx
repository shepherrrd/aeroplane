import { Login02Icon, ShieldUserIcon } from "@hugeicons/core-free-icons";
import { FormEvent, useState } from "react";
import { api } from "../api";
import { AppIcon, FieldLabel, FormInput } from "../components/ui/primitives";
import { BrandMark } from "../components/ui/brand-mark";
import { usePageTitle } from "../lib/page-title";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  usePageTitle("Login");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.login({ email, password });
      window.dispatchEvent(new Event("aeroplane-auth-changed"));
      window.location.assign("/");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not sign in");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative isolate grid min-h-dvh place-items-center overflow-hidden bg-zinc-950 px-5 py-10 text-zinc-100">
      <div aria-hidden className="hero-noise pointer-events-none absolute inset-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_0%_0%,rgba(79,184,178,0.12),transparent),radial-gradient(ellipse_70%_50%_at_100%_100%,rgba(120,113,255,0.08),transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:72px_72px]"
      />

      <section className="relative z-10 w-full max-w-md border border-zinc-800 bg-zinc-950/88 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center border border-[#4FB8B2]/35 bg-[#4FB8B2]/10 text-[#4FB8B2]">
            <BrandMark />
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">Aeroplane access</div>
            <h1 className="font-hero text-xl tracking-tight text-zinc-100">Sign in</h1>
          </div>
        </div>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <FieldLabel>Email</FieldLabel>
            <FormInput
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div>
            <FieldLabel>Password</FieldLabel>
            <FormInput
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {error ? <div className="border border-rose-500/35 bg-rose-950/30 px-3 py-2 font-mono text-xs text-rose-300">{error}</div> : null}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-11 w-full items-center justify-center gap-2 border border-[#4FB8B2]/50 bg-[#4FB8B2]/15 px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7fe3dd] transition-colors hover:bg-[#4FB8B2]/25 disabled:opacity-60"
          >
            <AppIcon icon={submitting ? ShieldUserIcon : Login02Icon} size={16} />
            {submitting ? "Signing in" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}

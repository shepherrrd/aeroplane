import { Logout02Icon } from "@hugeicons/core-free-icons";
import { api } from "../../api";
import { AppIcon } from "../ui/primitives";

export function SignOutButton({ className = "" }: { className?: string }) {
  async function signOut() {
    await api.logout().catch(() => null);
    window.dispatchEvent(new Event("aeroplane-auth-changed"));
    window.location.assign("/login");
  }

  return (
    <button
      type="button"
      className={`inline-flex h-9 w-9 items-center justify-center border border-zinc-700 bg-zinc-900 text-zinc-400 transition-colors hover:border-rose-500/35 hover:bg-rose-500/10 hover:text-rose-200 ${className}`}
      title="Sign out"
      aria-label="Sign out"
      onClick={() => void signOut()}
    >
      <AppIcon icon={Logout02Icon} size={15} />
    </button>
  );
}

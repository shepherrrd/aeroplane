import { FolderCodeIcon, AddSquareIcon } from "@hugeicons/core-free-icons";
import { FormEvent, useEffect, useState } from "react";
import { ModalShell } from "../../components/modals/modal-shell";
import { FieldLabel, FormInput, AppIcon, shellButton } from "../../components/ui/primitives";

export function CreateProjectModal({
  open,
  onClose,
  onCreate
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: { name: string; description?: string }) => Promise<void>;
}) {
  const [form, setForm] = useState({ name: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setForm({ name: "", description: "" });
      setBusy(false);
      setError("");
    }
  }, [open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onCreate({ name: form.name, description: form.description || undefined });
      onClose();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not create project");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      icon={FolderCodeIcon}
      title="New project"
      meta="Create the project first, then add services inside it."
      width="max-w-lg"
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <FieldLabel>Project name</FieldLabel>
          <FormInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Acme platform" required />
        </div>
        <div>
          <FieldLabel>Description</FieldLabel>
          <FormInput value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Internal tools and APIs" />
        </div>
        {error ? <p className="text-sm text-rose-200">{error}</p> : null}
        <div className="flex justify-end">
          <button type="submit" className={shellButton("primary")} disabled={busy}>
            <AppIcon icon={AddSquareIcon} size={16} />
            {busy ? "Creating..." : "Create project"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

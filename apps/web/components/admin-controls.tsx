"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button, Input, Label, Select } from "@/components/ui";
import { useToast } from "@/components/toast";

type Variant = "primary" | "outline" | "danger" | "ghost";

export function AdminActionButton({
  endpoint,
  method = "POST",
  body,
  label,
  confirmText,
  variant = "outline",
  icon,
  size = "sm",
}: {
  endpoint: string;
  method?: "POST" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
  label: string;
  confirmText?: string;
  variant?: Variant;
  icon?: React.ReactNode;
  size?: "sm" | "md";
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function run() {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Request failed");
      toast("success", label);
      router.refresh();
    } catch (error) {
      toast("error", `${label} failed`, error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant={variant} size={size} onClick={run} disabled={busy}>
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {label}
    </Button>
  );
}

export function AddSourceForm({ defaultRepo = "" }: { defaultRepo?: string }) {
  const [type, setType] = useState("GITHUB_REPO");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    try {
      const response = await fetch("/api/admin/sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          type,
          repo: form.get("repo"),
          url: form.get("url"),
          path: form.get("path"),
          trustTier: form.get("trustTier"),
          frequencyMinutes: Number(form.get("frequencyMinutes")),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not add source");
      toast("success", "Source added", "Run a sync to import its skills.");
      formElement.reset();
      router.refresh();
    } catch (error) {
      toast("error", "Add source failed", error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <h2 className="text-sm font-semibold">Add a source</h2>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          HTTPS only. GitHub repositories are imported as Agent Skills; feeds create discoveries for review.
        </p>
      </div>
      <div>
        <Label htmlFor="source-type">Type</Label>
        <Select id="source-type" value={type} onChange={(event) => setType(event.target.value)} className="w-full">
          <option value="GITHUB_REPO">GitHub repository</option>
          <option value="RSS">RSS / Atom feed</option>
          <option value="HTTP_JSON">JSON feed</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="source-trust">Trust tier</Label>
        <Select id="source-trust" name="trustTier" defaultValue="COMMUNITY" className="w-full">
          <option value="OFFICIAL">Official</option>
          <option value="VERIFIED">Verified</option>
          <option value="COMMUNITY">Community</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="source-name">Display name</Label>
        <Input id="source-name" name="name" placeholder="Anthropic Skills" maxLength={120} />
      </div>
      <div>
        <Label htmlFor="source-frequency">Check every (minutes)</Label>
        <Input id="source-frequency" name="frequencyMinutes" type="number" min={60} max={10080} defaultValue={360} />
      </div>
      {type === "GITHUB_REPO" ? (
        <>
          <div>
            <Label htmlFor="source-repo">Repository</Label>
            <Input id="source-repo" name="repo" defaultValue={defaultRepo} placeholder="anthropics/skills" required />
          </div>
          <div>
            <Label htmlFor="source-path">Subdirectory (optional)</Label>
            <Input id="source-path" name="path" placeholder="skills" />
          </div>
        </>
      ) : (
        <div className="sm:col-span-2">
          <Label htmlFor="source-url">Feed URL</Label>
          <Input id="source-url" name="url" type="url" placeholder="https://example.com/feed.xml" required />
        </div>
      )}
      <div className="flex items-end sm:col-span-2">
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Add source
        </Button>
      </div>
    </form>
  );
}

export function SourceRowActions({ id, enabled }: { id: string; enabled: boolean }) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <AdminActionButton
        endpoint={`/api/admin/sources/${id}/sync`}
        label="Sync"
        icon={<RefreshCw className="size-3" />}
      />
      <AdminActionButton
        endpoint={`/api/admin/sources/${id}`}
        method="PATCH"
        body={{ enabled: !enabled }}
        label={enabled ? "Pause" : "Enable"}
      />
      <AdminActionButton
        endpoint={`/api/admin/sources/${id}`}
        method="DELETE"
        label="Delete"
        variant="danger"
        icon={<Trash2 className="size-3" />}
        confirmText="Delete this source and all of its imported skills/versions? This cannot be undone."
      />
    </div>
  );
}

export function CategoryEditor({
  id,
  name,
  description,
  skillCount,
}: {
  id: string;
  name: string;
  description: string;
  skillCount: number;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/categories/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), description: form.get("description") }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Update failed");
      toast("success", "Category updated");
      router.refresh();
    } catch (error) {
      toast("error", "Update failed", error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete category "${name}"? It must have no skills.`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/categories/${id}`, { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Delete failed");
      toast("success", "Category deleted");
      router.refresh();
    } catch (error) {
      toast("error", "Delete failed", error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        <Label htmlFor={`name-${id}`}>Name</Label>
        <Input id={`name-${id}`} name="name" defaultValue={name} maxLength={80} />
      </div>
      <div className="min-w-0 flex-[2]">
        <Label htmlFor={`desc-${id}`}>Description</Label>
        <Input id={`desc-${id}`} name="description" defaultValue={description} maxLength={400} />
      </div>
      <div className="shrink-0 pb-0.5 font-mono text-[10px] text-muted-foreground">{skillCount} skills</div>
      <div className="flex shrink-0 gap-1">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Save
        </Button>
        <Button type="button" size="sm" variant="danger" onClick={remove} disabled={busy}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </form>
  );
}

export function AddCategoryForm() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    try {
      const response = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          description: form.get("description"),
          icon: form.get("icon"),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not add category");
      toast("success", "Category added");
      formElement.reset();
      router.refresh();
    } catch (error) {
      toast("error", "Add category failed", error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <h2 className="text-sm font-semibold">Add category</h2>
      </div>
      <div>
        <Label htmlFor="category-name">Name</Label>
        <Input id="category-name" name="name" required maxLength={80} placeholder="Data engineering" />
      </div>
      <div>
        <Label htmlFor="category-icon">Icon key</Label>
        <Input id="category-icon" name="icon" maxLength={40} placeholder="database" />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="category-description">Description</Label>
        <Input id="category-description" name="description" maxLength={400} placeholder="Pipelines, warehouses and analytics." />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Add category
        </Button>
      </div>
    </form>
  );
}

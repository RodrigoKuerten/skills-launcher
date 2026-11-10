import { useState, type FormEvent } from "react";
import { FolderOpen, Info, LoaderCircle, ShieldCheck } from "lucide-react";
import { SOURCE_KINDS, TRUST_LEVELS } from "../../lib/constants";
import { errorMessage, formatInterval, parsePositiveInt } from "../../lib/format";
import { ipc } from "../../lib/ipc";
import type { Source, SourceInput, SourceKind, TrustLevel } from "../../lib/types";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Field, Input, Textarea } from "../ui/Input";
import { Select } from "../ui/Select";
import { Switch } from "../ui/Switch";
import { useToast } from "../ui/Toast";

export interface SourceFormDialogProps {
  source: Source | null;
  onClose: () => void;
  onSaved: () => void;
}

function isPickerKind(kind: SourceKind): boolean {
  return kind === "local_dir" || kind === "zip";
}

function configString(source: Source | null, key: string): string {
  const value = source?.config?.[key];
  return typeof value === "string" ? value : "";
}

function configNumber(source: Source | null, key: string): string {
  const value = source?.config?.[key];
  return typeof value === "number" || typeof value === "string" ? String(value) : "";
}

function validateRemoteUrl(kind: SourceKind, value: string): string | null {
  if (!value.trim()) return "A URL is required.";
  if (kind === "github_repo" || kind === "github_org") {
    try {
      const url = new URL(value.trim());
      if (url.protocol !== "https:" || url.hostname !== "github.com") {
        return "Use an https://github.com/ URL.";
      }
      const segments = url.pathname.split("/").filter(Boolean);
      if (kind === "github_repo" && segments.length < 2) {
        return "Use https://github.com/owner/repo.";
      }
      if (kind === "github_org" && segments.length < 1) {
        return "Use https://github.com/owner.";
      }
    } catch {
      return "Enter a valid GitHub URL.";
    }
  }
  if (kind === "http_json") {
    try {
      const url = new URL(value.trim());
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        return "Use an HTTP or HTTPS catalog URL.";
      }
    } catch {
      return "Enter a valid catalog URL.";
    }
  }
  if (kind === "git_repo") {
    const trimmed = value.trim();
    if (
      !trimmed.startsWith("https://") &&
      !trimmed.startsWith("http://") &&
      !trimmed.startsWith("ssh://") &&
      !trimmed.startsWith("git@")
    ) {
      return "Use an HTTPS, SSH or git@ repository URL.";
    }
  }
  return null;
}

export function SourceFormDialog({ source, onClose, onSaved }: SourceFormDialogProps) {
  const toast = useToast();
  const [name, setName] = useState(source?.name ?? "");
  const [kind, setKind] = useState<SourceKind>(source?.kind ?? "github_repo");
  const [remoteUrl, setRemoteUrl] = useState(
    source && !isPickerKind(source.kind) ? source.url : "",
  );
  const [pickedPath, setPickedPath] = useState<string | null>(null);
  const [author, setAuthor] = useState(source?.author ?? "");
  const [description, setDescription] = useState(source?.description ?? "");
  const [trust, setTrust] = useState<TrustLevel>(source?.trust ?? "COMMUNITY");
  const [enabled, setEnabled] = useState(source?.enabled ?? true);
  const [autoSync, setAutoSync] = useState(source?.autoSync ?? false);
  const [intervalText, setIntervalText] = useState(String(source?.intervalMinutes ?? 360));
  const [repo, setRepo] = useState(configString(source, "repo"));
  const [branch, setBranch] = useState(configString(source, "branch"));
  const [path, setPath] = useState(configString(source, "path"));
  const [orgLimit, setOrgLimit] = useState(configString(source, "limit") || "10");
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const picker = isPickerKind(kind);
  const sourceWasPicker = source ? isPickerKind(source.kind) : false;
  const displayedPath = pickedPath ?? (sourceWasPicker ? (source?.url ?? "") : "");
  const kindMeta = SOURCE_KINDS.find((item) => item.value === kind);

  const changeKind = (next: SourceKind) => {
    if (next === kind) return;
    setKind(next);
    setErrors({});
  };

  const pickPath = async () => {
    setPicking(true);
    try {
      const result = await ipc.pickSourcePath(kind === "zip" ? "zip" : "dir");
      if (result) {
        setPickedPath(result);
        setErrors((current) => ({ ...current, url: "" }));
      }
    } catch (reason) {
      toast.error("Could not open the file picker", errorMessage(reason));
    } finally {
      setPicking(false);
    }
  };

  const buildConfig = (): Record<string, unknown> => {
    const config: Record<string, unknown> = {};
    if (kind === "github_repo") {
      if (repo.trim()) config.repo = repo.trim();
      if (branch.trim()) config.branch = branch.trim();
      if (path.trim()) config.path = path.trim();
    } else if (kind === "github_org") {
      const limit = parsePositiveInt(orgLimit, 10);
      config.limit = Math.min(25, Math.max(1, limit));
      if (branch.trim()) config.branch = branch.trim();
      if (path.trim()) config.path = path.trim();
    } else if (kind === "git_repo") {
      if (branch.trim()) config.branch = branch.trim();
      if (path.trim()) config.path = path.trim();
    }
    return config;
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (saving) return;
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = "A name is required.";
    const interval = Number(intervalText);
    if (!Number.isInteger(interval) || interval < 30 || interval > 10080) {
      nextErrors.interval = "Use 30 to 10080 minutes.";
    }
    let url = remoteUrl.trim();
    if (picker) {
      if (!pickedPath) {
        nextErrors.url = sourceWasPicker
          ? "Re-select the path to grant access for this session."
          : "Choose a folder or ZIP with the native picker.";
      } else {
        url = pickedPath;
      }
    } else {
      const urlError = validateRemoteUrl(kind, remoteUrl);
      if (urlError) nextErrors.url = urlError;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const input: SourceInput = {
      name: name.trim(),
      kind,
      url,
      author: author.trim(),
      description: description.trim(),
      config: buildConfig(),
      trust,
      enabled,
      autoSync,
      intervalMinutes: interval,
    };

    setSaving(true);
    setSubmitError(null);
    try {
      if (source) {
        await ipc.updateSource(source.id, input);
        toast.success("Source updated", `${input.name} was saved.`);
      } else {
        await ipc.addSource(input);
        toast.success("Source added", `${input.name} is ready to sync.`);
      }
      onSaved();
      onClose();
    } catch (reason) {
      const message = errorMessage(reason);
      setSubmitError(message);
      toast.error(source ? "Could not update source" : "Could not add source", message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !saving) onClose();
      }}
      title={source ? "Edit source" : "Add source"}
      description={
        source
          ? "Update how this source is fetched and synced."
          : "Connect a repository, folder, archive or JSON catalog to the local library."
      }
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="source-form" variant="primary" loading={saving}>
            {source ? "Save changes" : "Add source"}
          </Button>
        </>
      }
    >
      <form id="source-form" onSubmit={(event) => void submit(event)} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="source-name" error={errors.name}>
            <Input
              id="source-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (errors.name) setErrors((current) => ({ ...current, name: "" }));
              }}
              placeholder="Team skills"
              autoFocus
            />
          </Field>
          <Field label="Kind" htmlFor="source-kind">
            <Select
              id="source-kind"
              value={kind}
              onChange={(event) => changeKind(event.target.value as SourceKind)}
              options={SOURCE_KINDS.map((item) => ({ value: item.value, label: item.label }))}
            />
          </Field>
        </div>

        <div className="space-y-3 rounded-xl border border-line bg-surface/35 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium text-text">{kindMeta?.label}</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-muted">{kindMeta?.description}</p>
            </div>
            <ShieldCheck className="size-4 shrink-0 text-brand-soft/60" aria-hidden="true" />
          </div>

          {picker ? (
            <Field
              label={kind === "zip" ? "ZIP archive" : "Folder"}
              error={errors.url}
              hint={
                sourceWasPicker && !pickedPath
                  ? "The path is displayed below, but this session needs a fresh picker grant before saving."
                  : "Paths can only be granted through the native picker."
              }
            >
              <div className="flex gap-2">
                <div className="flex min-w-0 flex-1 items-center rounded-[10px] border border-line bg-canvas/45 px-3">
                  <FolderOpen className="mr-2 size-3.5 shrink-0 text-muted" aria-hidden="true" />
                  <span className="truncate font-mono text-[10px] text-muted" title={displayedPath || undefined}>
                    {displayedPath || "No path selected"}
                  </span>
                </div>
                <Button variant="secondary" onClick={() => void pickPath()} loading={picking}>
                  {!picking ? <FolderOpen className="size-3.5" aria-hidden="true" /> : null}
                  Choose…
                </Button>
              </div>
            </Field>
          ) : (
            <Field
              label="Source URL"
              htmlFor="source-url"
              error={errors.url}
              hint={kindMeta?.configHint}
            >
              <Input
                id="source-url"
                value={remoteUrl}
                onChange={(event) => {
                  setRemoteUrl(event.target.value);
                  if (errors.url) setErrors((current) => ({ ...current, url: "" }));
                }}
                placeholder={kindMeta?.configHint}
                spellCheck={false}
              />
            </Field>
          )}

          {kind === "github_repo" ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Repository" htmlFor="source-repo" optional hint="owner/repo">
                <Input
                  id="source-repo"
                  value={repo}
                  onChange={(event) => setRepo(event.target.value)}
                  placeholder="From URL"
                  spellCheck={false}
                />
              </Field>
              <Field label="Branch" htmlFor="source-branch" optional>
                <Input
                  id="source-branch"
                  value={branch}
                  onChange={(event) => setBranch(event.target.value)}
                  placeholder="Default branch"
                  spellCheck={false}
                />
              </Field>
              <Field label="Path" htmlFor="source-path" optional hint="skills/">
                <Input
                  id="source-path"
                  value={path}
                  onChange={(event) => setPath(event.target.value)}
                  placeholder="Repository root"
                  spellCheck={false}
                />
              </Field>
            </div>
          ) : null}

          {kind === "github_org" ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Repo limit" htmlFor="source-limit" hint="1–25 repositories">
                <Input
                  id="source-limit"
                  type="number"
                  min={1}
                  max={25}
                  value={orgLimit}
                  onChange={(event) => setOrgLimit(event.target.value)}
                />
              </Field>
              <Field label="Branch" htmlFor="source-branch" optional>
                <Input
                  id="source-branch"
                  value={branch}
                  onChange={(event) => setBranch(event.target.value)}
                  placeholder="Default branch"
                />
              </Field>
              <Field label="Path" htmlFor="source-path" optional hint="skills/">
                <Input
                  id="source-path"
                  value={path}
                  onChange={(event) => setPath(event.target.value)}
                  placeholder="Repository root"
                />
              </Field>
            </div>
          ) : null}

          {kind === "git_repo" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Branch" htmlFor="source-branch" optional>
                <Input
                  id="source-branch"
                  value={branch}
                  onChange={(event) => setBranch(event.target.value)}
                  placeholder="Default branch"
                />
              </Field>
              <Field label="Path" htmlFor="source-path" optional hint="skills/">
                <Input
                  id="source-path"
                  value={path}
                  onChange={(event) => setPath(event.target.value)}
                  placeholder="Repository root"
                />
              </Field>
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Author" htmlFor="source-author" optional>
            <Input
              id="source-author"
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              placeholder="Publisher or team"
            />
          </Field>
          <Field label="Trust" htmlFor="source-trust" hint="Shown as a signal in the catalog.">
            <Select
              id="source-trust"
              value={trust}
              onChange={(event) => setTrust(event.target.value as TrustLevel)}
              options={TRUST_LEVELS.map((item) => ({ value: item.value, label: item.label }))}
            />
          </Field>
          <Field label="Description" htmlFor="source-description" optional className="sm:col-span-2">
            <Textarea
              id="source-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What lives in this source?"
              className="min-h-20 font-sans text-[12px]"
            />
          </Field>
        </div>

        <div className="space-y-3 rounded-xl border border-line bg-surface/35 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium text-text">Enabled</p>
              <p className="mt-0.5 text-[10px] text-muted">Include this source in catalog searches.</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} label="Enable source" />
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-line/60 pt-3">
            <div>
              <p className="text-[11px] font-medium text-text">Auto-sync</p>
              <p className="mt-0.5 text-[10px] text-muted">Refresh this source on its interval.</p>
            </div>
            <Switch checked={autoSync} onCheckedChange={setAutoSync} label="Enable auto-sync" />
          </div>
          <div className="grid gap-3 border-t border-line/60 pt-3 sm:grid-cols-2">
            <Field
              label="Interval"
              htmlFor="source-interval"
              error={errors.interval}
              hint={`${formatInterval(parsePositiveInt(intervalText, 360))} · 30 to 10080 minutes`}
            >
              <Input
                id="source-interval"
                type="number"
                min={30}
                max={10080}
                value={intervalText}
                onChange={(event) => {
                  setIntervalText(event.target.value);
                  if (errors.interval) setErrors((current) => ({ ...current, interval: "" }));
                }}
              />
            </Field>
          </div>
        </div>

        {submitError ? (
          <p role="alert" className="rounded-lg border border-danger/25 bg-danger/[0.06] px-3 py-2 text-[11px] leading-relaxed text-danger">
            {submitError}
          </p>
        ) : null}

        <p className="flex items-start gap-2 text-[10px] leading-relaxed text-muted/60">
          <Info className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          Sources are fetched by the Rust backend. The UI never reads local paths or makes network
          requests directly. Removing a source is a soft delete; installed files are untouched.
        </p>
        {saving ? (
          <p className="flex items-center gap-2 text-[10px] text-muted">
            <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
            Saving source…
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}

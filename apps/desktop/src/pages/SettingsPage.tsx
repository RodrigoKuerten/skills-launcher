import { useEffect, useState, type FormEvent } from "react";
import {
  BadgeCheck,
  BookOpen,
  Info,
  KeyRound,
  Moon,
  Save,
  Scale,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { useAppData } from "../app/app-context";
import { ExternalLink } from "../components/ExternalLink";
import { PageHeader } from "../components/layout/PageHeader";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Input";
import { Switch } from "../components/ui/Switch";
import { useToast } from "../components/ui/Toast";
import { APP_NAME, APP_VERSION } from "../lib/constants";
import { cx } from "../lib/cx";
import { errorMessage, formatInterval, parsePositiveInt } from "../lib/format";
import { ipc } from "../lib/ipc";
import type { Settings, Theme } from "../lib/types";

export default function SettingsPage() {
  const { bootstrap, refresh } = useAppData();
  const toast = useToast();
  const settings = bootstrap?.settings;
  const [theme, setTheme] = useState<Theme>(settings?.theme === "light" ? "light" : "dark");
  const [autoSync, setAutoSync] = useState(settings?.autoSync ?? false);
  const [intervalText, setIntervalText] = useState(String(settings?.autoSyncIntervalMinutes ?? 360));
  const [token, setToken] = useState("");
  const [tokenSet, setTokenSet] = useState(settings?.githubTokenSet ?? false);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [theme, autoSync, intervalText, token]);

  if (!bootstrap || !settings) return null;

  const applySettings = (next: Settings) => {
    const nextTheme = next.theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    setTheme(nextTheme);
    setAutoSync(next.autoSync);
    setIntervalText(String(next.autoSyncIntervalMinutes));
    setTokenSet(next.githubTokenSet);
    setToken("");
  };

  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    if (saving) return;
    const interval = Number(intervalText);
    if (!Number.isInteger(interval) || interval < 30 || interval > 10080) {
      setError("Auto-sync interval must be between 30 and 10080 minutes.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const next = await ipc.updateSettings({
        theme,
        autoSync,
        autoSyncIntervalMinutes: interval,
        ...(token.trim() ? { githubToken: token.trim() } : {}),
      });
      applySettings(next);
      toast.success("Settings saved", "The local settings were updated.");
      await refresh();
    } catch (reason) {
      const message = errorMessage(reason, "Could not save settings.");
      setError(message);
      toast.error("Could not save settings", message);
    } finally {
      setSaving(false);
    }
  };

  const clearToken = async () => {
    setClearing(true);
    setError(null);
    try {
      const next = await ipc.updateSettings({ githubToken: "" });
      setTokenSet(next.githubTokenSet);
      setToken("");
      toast.success("Session token cleared", "GitHub requests will use the unauthenticated rate limit.");
      await refresh();
    } catch (reason) {
      toast.error("Could not clear the token", errorMessage(reason));
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="System"
        title="Settings"
        description="Catalog behavior and appearance are stored in the local SQLite database. The GitHub token stays in memory."
        actions={
          <Button type="submit" form="settings-form" variant="primary" size="sm" loading={saving}>
            {!saving ? <Save className="size-3.5" aria-hidden="true" /> : null}
            Save changes
          </Button>
        }
      />

      <form id="settings-form" onSubmit={(event) => void save(event)} className="max-w-3xl space-y-4">
        <section className="rounded-[14px] border border-line bg-surface/45">
          <div className="border-b border-line/70 px-4 py-3">
            <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-text">Appearance</h2>
            <p className="mt-0.5 text-[11px] text-muted">The interface defaults to the dark palette.</p>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2" role="radiogroup" aria-label="Interface theme">
            {(
              [
                { value: "dark" as Theme, label: "Dark", description: "Near-black canvas and blue accents.", icon: Moon },
                { value: "light" as Theme, label: "Light", description: "The same tokens on a light canvas.", icon: Sun },
              ] as const
            ).map((option) => {
              const Icon = option.icon;
              const selected = theme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setTheme(option.value)}
                  className={cx(
                    "flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
                    selected
                      ? "border-brand/45 bg-brand/[0.07]"
                      : "border-line bg-canvas/25 hover:border-brand/25",
                  )}
                >
                  <span
                    className={cx(
                      "grid size-8 shrink-0 place-items-center rounded-lg border",
                      selected
                        ? "border-brand/35 bg-brand/10 text-brand-soft"
                        : "border-line bg-elevated/50 text-muted",
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="flex items-center gap-2 text-[12px] font-medium text-text">
                      {option.label}
                      {selected ? <Badge tone="brand">Selected</Badge> : null}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">
                      {option.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="px-4 pb-3 text-[11px] text-muted-soft">Theme changes apply after saving.</p>
        </section>

        <section className="rounded-[14px] border border-line bg-surface/45">
          <div className="border-b border-line/70 px-4 py-3">
            <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-text">Catalog behavior</h2>
            <p className="mt-0.5 text-[11px] text-muted">Sync preferences for the local source engine.</p>
          </div>
          <div className="space-y-4 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-medium text-text">Auto-sync sources</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                  Allow the backend to refresh enabled sources on an interval.
                </p>
              </div>
              <Switch checked={autoSync} onCheckedChange={setAutoSync} label="Enable auto-sync" />
            </div>
            <div className="border-t border-line/60 pt-4">
              <Field
                label="Auto-sync interval"
                htmlFor="settings-interval"
                hint={`Default for new sources · ${formatInterval(parsePositiveInt(intervalText, 360))} · 30 to 10080 minutes`}
                className="max-w-xs"
              >
                <Input
                  id="settings-interval"
                  type="number"
                  min={30}
                  max={10080}
                  value={intervalText}
                  onChange={(event) => setIntervalText(event.target.value)}
                  disabled={!autoSync}
                />
              </Field>
            </div>
          </div>
        </section>

        <section className="rounded-[14px] border border-line bg-surface/45">
          <div className="border-b border-line/70 px-4 py-3">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold tracking-[-0.01em] text-text">
              GitHub access
              {tokenSet ? <Badge tone="ok">Session token set</Badge> : <Badge tone="neutral">No token</Badge>}
            </h2>
            <p className="mt-0.5 text-[11px] text-muted">
              Raises GitHub rate limits for source syncs. Optional for public repositories.
            </p>
          </div>
          <div className="space-y-3 p-4">
            <Field
              label="Personal access token"
              htmlFor="settings-token"
              hint="Held in memory by the Rust backend for this session only. It is not written to SQLite and is lost when the app closes."
            >
              <Input
                id="settings-token"
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder={tokenSet ? "Leave blank to keep the session token" : "Paste a GitHub token"}
                autoComplete="off"
                leadingIcon={<KeyRound className="size-3.5" aria-hidden="true" />}
              />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              {tokenSet ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void clearToken()}
                  loading={clearing}
                >
                  Clear session token
                </Button>
              ) : null}
              <p className="text-[11px] leading-relaxed text-muted-soft">
                The token is passed to source adapters in memory and is never displayed again.
              </p>
            </div>
          </div>
        </section>

        {error ? (
          <p role="alert" className="rounded-lg border border-danger/25 bg-danger/[0.06] px-3 py-2.5 text-[11px] leading-relaxed text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[13px] border border-line bg-surface/30 px-4 py-3">
          <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Settings apply to this local catalog. No account is required and no settings are uploaded.
          </p>
          <Button type="submit" form="settings-form" variant="primary" loading={saving}>
            {!saving ? <Save className="size-3.5" aria-hidden="true" /> : null}
            Save changes
          </Button>
        </div>
      </form>

      <section className="max-w-3xl rounded-[14px] border border-line bg-surface/45">
        <div className="flex items-start gap-4 p-4">
          <img
            src="/logo.png"
            alt=""
            className="size-12 shrink-0 rounded-xl ring-1 ring-white/10"
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-text">{APP_NAME}</h2>
            <p className="mt-0.5 text-[11px] text-muted">
              Version {APP_VERSION} · Tauri 2 · React 19 · local SQLite
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              A desktop-first universal skills manager. Sources, scan findings and installation
              provenance live in the local catalog; the UI only talks to the Rust backend.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]">
              <ExternalLink href="https://code.claude.com/docs/en/skills">
                <BookOpen className="mr-0.5 inline size-3" aria-hidden="true" />
                Agent Skills docs
              </ExternalLink>
              <ExternalLink href="https://developers.openai.com/codex/skills">Codex skills</ExternalLink>
              <ExternalLink href="https://opencode.ai/docs/skills">OpenCode skills</ExternalLink>
              <ExternalLink href="https://opensource.org/license/mit">
                <Scale className="mr-0.5 inline size-3" aria-hidden="true" />
                MIT license
              </ExternalLink>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone="brand">
                <BadgeCheck className="size-2.5" aria-hidden="true" />
                Local-first
              </Badge>
              <Badge tone="neutral">
                <ShieldCheck className="size-2.5" aria-hidden="true" />
                No account
              </Badge>
              <Badge tone="neutral">Application code: MIT</Badge>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-soft">
              Imported skills retain their original licenses and attribution. Check each skill's
              provenance before installing or redistributing it.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

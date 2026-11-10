"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  CircleAlert,
  Cpu,
  Loader2,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Unplug,
  Wrench,
} from "lucide-react";
import { Button, Card, Input, Label } from "@/components/ui";
import { CopyButton } from "@/components/actions";
import { useToast } from "@/components/toast";
import { cn, formatDate, hostLabel } from "@/lib/utils";

type AgentInfo = {
  host: string;
  name: string;
  detected: boolean;
  executablePath: string | null;
  version: string | null;
  configPath: string | null;
  skillsPath: string | null;
  supportsAgentSkills: boolean;
  autoInstall: boolean;
  notes: string[];
};

type InstalledInfo = {
  skillSlug: string;
  name: string;
  host: string;
  versionLabel: string;
  contentHash: string;
  installPath: string;
  installedAt: string;
  updatedAt: string;
};

type UpdateInfo = {
  skillSlug?: string;
  slug?: string;
  name?: string;
  host: string;
  currentVersion?: string;
  latestVersion?: string;
  updateAvailable?: boolean;
};

const TOKEN_KEY = "skillsHubAgentToken";
const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL ?? "http://127.0.0.1:4780";

function listFrom<T>(value: unknown, key: string): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object" && Array.isArray((value as Record<string, unknown>)[key])) {
    return (value as Record<string, T[]>)[key] ?? [];
  }
  return [];
}

function normalizeResults(value: unknown): Array<{ host: string; ok: boolean; message: string }> {
  const successes = listFrom<Record<string, unknown>>(value, "results").map((result) => {
    if (typeof result.ok === "boolean") {
      return { host: String(result.host ?? "unknown"), ok: result.ok, message: String(result.message ?? "") };
    }
    const installed = result.installed as { host?: string; versionLabel?: string } | undefined;
    return {
      host: installed?.host ?? String(result.host ?? "unknown"),
      ok: true,
      message: installed?.versionLabel ? `installed ${installed.versionLabel}` : "installed",
    };
  });
  const failures = listFrom<Record<string, unknown>>(value, "errors").map((error) => ({
    host: String(error.host ?? error.slug ?? "unknown"),
    ok: false,
    message: String(error.message ?? "failed"),
  }));
  return [...successes, ...failures];
}

export function AgentsDashboard() {
  const [token, setToken] = useState("");
  const [paired, setPaired] = useState(false);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [installed, setInstalled] = useState<InstalledInfo[]>([]);
  const [updates, setUpdates] = useState<UpdateInfo[]>([]);
  const [autoUpdate, setAutoUpdate] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const stored = sessionStorage.getItem(TOKEN_KEY);
    if (stored) {
      setToken(stored);
      setPaired(true);
    }
  }, []);

  const call = useCallback(
    async (path: string, init?: RequestInit) => {
      if (!token) throw new Error("Pair a companion token first.");
      const response = await fetch(`${AGENT_URL}${path}`, {
        ...init,
        headers: { "content-type": "application/json", "x-agent-token": token, ...(init?.headers ?? {}) },
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) throw new Error((data.error as string) ?? `Companion returned ${response.status}`);
      return data;
    },
    [token],
  );

  const refresh = useCallback(async () => {
    setBusy("refresh");
    setError(null);
    try {
      const [detectData, installedData, updateData, settingsData] = await Promise.all([
        call("/api/detect", { method: "POST", body: "{}" }),
        call("/api/installed"),
        call(`/api/updates?appUrl=${encodeURIComponent(window.location.origin)}`).catch(() => ({})),
        call("/api/settings").catch(() => ({})),
      ]);
      setAgents(listFrom<AgentInfo>(detectData, "agents"));
      setInstalled(listFrom<InstalledInfo>(installedData, "installations"));
      setAutoUpdate(settingsData && typeof settingsData === "object" && (settingsData as { autoUpdate?: unknown }).autoUpdate === true);
      setUpdates(
        listFrom<UpdateInfo>(updateData, "updates").map((update) => ({
          ...update,
          skillSlug: update.skillSlug ?? update.slug ?? "",
          updateAvailable: true,
        })),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Companion not reachable");
    } finally {
      setBusy(null);
    }
  }, [call]);

  useEffect(() => {
    if (paired && token) void refresh();
  }, [paired, token, refresh]);

  function connect() {
    if (token.trim().length < 20) {
      toast("error", "Token looks too short", "Copy the token printed by `npm run agent`.");
      return;
    }
    sessionStorage.setItem(TOKEN_KEY, token.trim());
    setPaired(true);
  }

  async function toggleAutoUpdate() {
    const next = !autoUpdate;
    setBusy("settings");
    try {
      const data = await call("/api/settings", {
        method: "POST",
        body: JSON.stringify({ autoUpdate: next }),
      });
      const value = Boolean((data as { autoUpdate?: unknown }).autoUpdate);
      setAutoUpdate(value);
      toast(
        "success",
        value ? "Background updates enabled" : "Background updates disabled",
        value
          ? "The companion will periodically install licensed updates with checksum verification and backups."
          : "Updates will require a manual action.",
      );
    } catch (cause) {
      toast("error", "Could not change update setting", cause instanceof Error ? cause.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  async function runUpdate(slug?: string) {
    setBusy(slug ?? "all");
    try {
      const data = await call("/api/update", {
        method: "POST",
        body: JSON.stringify(slug ? { slug } : { all: true }),
      });
      const results = normalizeResults(data);
      const ok = results.filter((result) => result.ok).length;
      toast(ok ? "success" : "error", `${ok} update${ok === 1 ? "" : "s"} applied`, results.find((result) => !result.ok)?.message);
      await refresh();
    } catch (cause) {
      toast("error", "Update failed", cause instanceof Error ? cause.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  const detected = useMemo(() => agents.filter((agent) => agent.detected), [agents]);

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Companion connection</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">
                The companion runs on your machine at <code className="font-mono">{AGENT_URL.replace("http://", "")}</code>{" "}
                and requires a per-machine token on every request, including reads.
              </p>
            </div>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[10px]",
                paired && !error
                  ? "border-success/25 bg-success/10 text-success"
                  : "border-border bg-muted text-muted-foreground",
              )}
            >
              <span className={cn("size-1.5 rounded-full", paired && !error ? "bg-success" : "bg-border")} />
              {paired && !error ? "connected" : "not paired"}
            </span>
          </div>

          {!paired ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-medium">
                  <Terminal className="size-3.5 text-accent" /> 1. Start the companion
                </p>
                <div className="mt-2 flex items-center gap-1.5">
                  <code className="rounded border border-border bg-card px-1.5 py-1 font-mono text-[10px]">npm run agent</code>
                  <CopyButton value="npm run agent" label="Copy" />
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                  It prints a pairing token and binds only to 127.0.0.1:4780.
                </p>
              </div>
              <div>
                <Label htmlFor="pair-token">2. Paste the pairing token</Label>
                <Input
                  id="pair-token"
                  type="password"
                  autoComplete="off"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder="Token from the terminal"
                />
                <Button onClick={connect} className="mt-2 w-full" size="sm">
                  Pair this tab
                </Button>
                <p className="mt-1.5 text-[9px] text-muted-foreground">
                  Stored in sessionStorage only. A malicious website cannot read it cross-origin.
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={refresh} disabled={busy === "refresh"}>
                {busy === "refresh" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                Refresh
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  sessionStorage.removeItem(TOKEN_KEY);
                  setToken("");
                  setPaired(false);
                  setAgents([]);
                  setInstalled([]);
                }}
              >
                Unpair
              </Button>
              <span className="text-[10px] text-muted-foreground">
                {detected.length} agent{detected.length === 1 ? "" : "s"} detected
              </span>
            </div>
          )}

          {error ? (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/5 p-3 text-xs text-danger">
              <Unplug className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">Could not reach the companion</p>
                <p className="mt-0.5 text-danger/80">{error}</p>
                <p className="mt-1 text-muted-foreground">Start it with `npm run agent` and pair again.</p>
              </div>
            </div>
          ) : null}
        </Card>

        <Card>
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold">Detected agents</h2>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Detection uses executables in PATH and documented config paths. A folder alone is not proof.
              </p>
            </div>
          </div>
          <div className="divide-y divide-border">
            {agents.map((agent) => (
              <div key={agent.host} className="flex items-start gap-3 px-5 py-3">
                <div className={cn("mt-0.5 grid size-8 place-items-center rounded-lg border", agent.detected ? "border-success/25 bg-success/10 text-success" : "border-border bg-muted text-muted-foreground")}>
                  <Cpu className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-medium">{agent.name}</p>
                    <span className={cn("rounded-full px-1.5 py-0.5 text-[9px]", agent.detected ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>
                      {agent.detected ? `Detected${agent.version ? ` · ${agent.version}` : ""}` : "Not installed"}
                    </span>
                    {agent.detected && !agent.autoInstall ? (
                      <span className="rounded-full bg-warning/10 px-1.5 py-0.5 text-[9px] text-warning">manual only</span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[9px] text-muted-foreground">
                    {agent.skillsPath ?? agent.executablePath ?? agent.notes[0] ?? "No documented skills directory"}
                  </p>
                  {agent.notes.length > 1 || (!agent.detected && agent.notes.length) ? (
                    <p className="mt-0.5 line-clamp-1 text-[9px] text-muted-foreground">{agent.notes.join(" · ")}</p>
                  ) : null}
                </div>
                <span className={cn("mt-2 size-1.5 shrink-0 rounded-full", agent.detected ? "bg-success" : "bg-border")} />
              </div>
            ))}
            {!agents.length ? (
              <p className="p-5 text-xs text-muted-foreground">
                {paired ? "No detection result yet. Press refresh." : "Pair the companion to detect agents."}
              </p>
            ) : null}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold">Installed skills</h2>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Local installations tracked by the companion. Updates preserve extra files and create a backup first.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => runUpdate()} disabled={!installed.length || busy === "all"}>
              {busy === "all" ? <Loader2 className="size-3.5 animate-spin" /> : <Wrench className="size-3.5" />}
              Update all
            </Button>
          </div>
          <div className="divide-y divide-border">
            {installed.map((installation) => {
              const update = updates.find(
                (item) => item.skillSlug === installation.skillSlug && item.host === installation.host,
              );
              return (
                <div key={`${installation.skillSlug}-${installation.host}`} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <PackageCheck className="size-4 shrink-0 text-success" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{installation.name || installation.skillSlug}</p>
                    <p className="mt-0.5 font-mono text-[9px] text-muted-foreground">
                      {hostLabel(installation.host)} · {installation.versionLabel} · {formatDate(installation.updatedAt)}
                    </p>
                  </div>
                  {update?.updateAvailable ? (
                    <Button size="sm" onClick={() => runUpdate(installation.skillSlug)} disabled={busy === installation.skillSlug}>
                      {busy === installation.skillSlug ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                      Update {update.latestVersion}
                    </Button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] text-success">
                      <Check className="size-3" /> current
                    </span>
                  )}
                </div>
              );
            })}
            {!installed.length ? (
              <p className="p-5 text-xs text-muted-foreground">
                No installs tracked yet. Open a skill and install it into a detected agent.
              </p>
            ) : null}
          </div>
        </Card>
      </div>

      <aside className="min-w-0 space-y-4">
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-accent" />
            <h2 className="text-sm font-semibold">Security boundaries</h2>
          </div>
          <ul className="mt-3 space-y-2 text-[11px] leading-relaxed text-muted-foreground">
            <li>• Every request requires the machine token, including GETs.</li>
            <li>• The server checks the Host header and allowlisted browser origins.</li>
            <li>• Skill files are checksum-verified against the manifest.</li>
            <li>• Paths are allowlisted; traversal and absolute paths are rejected.</li>
            <li>• Backups are written before every replace; rollback is explicit.</li>
            <li>• Imported skill code is never executed.</li>
          </ul>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2">
            <RefreshCw className="size-4 text-accent" />
            <h2 className="text-sm font-semibold">Background updates</h2>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Off by default. When enabled, the companion periodically checks installed skills and installs licensed updates
            with checksum verification, a backup before replacement, and local journaling. Source-only skills are skipped.
          </p>
          <Button
            size="sm"
            variant={autoUpdate ? "outline" : "primary"}
            className="mt-3 w-full"
            onClick={toggleAutoUpdate}
            disabled={!paired || busy === "settings"}
          >
            {busy === "settings" ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {autoUpdate ? "Disable auto-update" : "Enable auto-update"}
          </Button>
          <p className="mt-2 font-mono text-[9px] text-muted-foreground">
            status: {autoUpdate ? "enabled" : "manual only"}
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2">
            <CircleAlert className="size-4 text-accent" />
            <h2 className="text-sm font-semibold">What the scan does not cover</h2>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Static heuristics can miss context-specific abuse. Review instructions before you run a skill, and keep
            secrets out of agent workspaces. Scan results are one signal, never a guarantee.
          </p>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold">Supported hosts</h2>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Claude Code, OpenAI Codex, OpenCode, Cursor, Windsurf, GitHub Copilot and Gemini CLI. Only hosts detected on
            this machine can receive installs.
          </p>
          <div className="mt-3 flex flex-wrap gap-1">
            {agents.map((agent) => (
              <span
                key={agent.host}
                className={cn(
                  "rounded-full border px-1.5 py-0.5 text-[9px]",
                  agent.detected ? "border-success/25 bg-success/10 text-success" : "border-border bg-muted text-muted-foreground",
                )}
              >
                {hostLabel(agent.host)}
              </span>
            ))}
          </div>
        </Card>
      </aside>
    </div>
  );
}

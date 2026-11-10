"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CircleAlert,
  Download,
  ExternalLink,
  Loader2,
  PackageCheck,
  RefreshCw,
  Terminal,
  Unplug,
} from "lucide-react";
import { Button, Card, Input, Label } from "@/components/ui";
import { CopyButton } from "@/components/actions";
import { CompatBadge, HostBadge } from "@/components/badges";
import { useToast } from "@/components/toast";
import { cn, formatDate, hostLabel } from "@/lib/utils";

type AgentInfo = {
  host: string;
  name: string;
  detected: boolean;
  executablePath: string | null;
  version: string | null;
  skillsPath: string | null;
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

type HostInfo = { name: string; docsUrl: string; userPath: string; projectPath: string | null };

const TOKEN_KEY = "skillsHubAgentToken";
const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL ?? "http://127.0.0.1:4780";

function asList<T>(value: unknown, key: string): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object" && Array.isArray((value as Record<string, unknown>)[key])) {
    return (value as Record<string, T[]>)[key] ?? [];
  }
  return [];
}

function normalizeResults(value: unknown): Array<{ host: string; ok: boolean; message: string }> {
  const successes = asList<Record<string, unknown>>(value, "results").map((result) => {
    if (typeof result.ok === "boolean") {
      return {
        host: String(result.host ?? "unknown"),
        ok: result.ok,
        message: String(result.message ?? ""),
      };
    }
    const installed = result.installed as { host?: string; versionLabel?: string } | undefined;
    const host = installed?.host ?? String(result.host ?? "unknown");
    return {
      host,
      ok: Boolean(host && host !== "unknown"),
      message: installed?.versionLabel ? `installed ${installed.versionLabel}` : "installed",
    };
  });
  const failures = asList<Record<string, unknown>>(value, "errors").map((error) => ({
    host: String(error.host ?? error.slug ?? "unknown"),
    ok: false,
    message: String(error.message ?? "failed"),
  }));
  return [...successes, ...failures];
}

export function InstallPanel({
  slug,
  name,
  license,
  canDownload,
  sourceUrl,
  repositoryUrl,
  compatibility,
  currentVersion,
  hosts,
  isAuthed,
}: {
  slug: string;
  name: string;
  license: string | null;
  canDownload: boolean;
  sourceUrl: string;
  repositoryUrl: string;
  compatibility: Array<{ host: string; status: string; notes: string }>;
  currentVersion: { versionLabel: string; fileCount: number; totalBytes: number; publishedAt: Date | null } | null;
  hosts: Record<string, HostInfo>;
  isAuthed: boolean;
}) {
  const [tab, setTab] = useState<"companion" | "manual" | "download">(canDownload ? "companion" : "download");
  const [manualHost, setManualHost] = useState(compatibility.find((item) => item.status === "VERIFIED")?.host ?? "claude-code");
  const [token, setToken] = useState("");
  const [tokenReady, setTokenReady] = useState(false);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [installed, setInstalled] = useState<InstalledInfo | null>(null);
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [results, setResults] = useState<Array<{ host: string; ok: boolean; message: string }>>([]);
  const { toast } = useToast();
  const autoDetected = useRef(false);

  useEffect(() => {
    const stored = sessionStorage.getItem(TOKEN_KEY);
    if (stored) {
      setToken(stored);
      setTokenReady(true);
    }
  }, []);

  const compatible = useMemo(
    () =>
      agents.filter(
        (agent) => agent.detected && compatibility.some((item) => item.host === agent.host && item.status === "VERIFIED"),
      ),
    [agents, compatibility],
  );

  const call = useCallback(
    async (path: string, init?: RequestInit) => {
      if (!token) throw new Error("Add your companion token first.");
      const response = await fetch(`${AGENT_URL}${path}`, {
        ...init,
        headers: {
          "content-type": "application/json",
          "x-agent-token": token,
          ...(init?.headers ?? {}),
        },
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) throw new Error((data.error as string) ?? `Companion returned ${response.status}`);
      return data;
    },
    [token],
  );

  async function detect() {
    setBusy("detect");
    setConnectionError(null);
    try {
      const data = await call("/api/detect", { method: "POST", body: "{}" });
      const list = asList<AgentInfo>(data, "agents");
      setAgents(list);
      const next: Record<string, boolean> = {};
      for (const agent of list) {
        if (agent.detected && compatibility.some((item) => item.host === agent.host && item.status === "VERIFIED")) {
          next[agent.host] = true;
        }
      }
      setSelection(next);
      const installedData = await call("/api/installed");
      const found = asList<InstalledInfo>(installedData, "installations").find((item) => item.skillSlug === slug);
      setInstalled(found ?? null);
      toast("success", "Companion connected", `${list.filter((item) => item.detected).length} agent(s) detected.`);
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Could not reach companion");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!tokenReady || !token || !canDownload || autoDetected.current) return;
    autoDetected.current = true;
    void detect();
    // detect intentionally runs once per mount after pairing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenReady, token]);

  function saveToken() {
    const cleaned = token.trim();
    if (cleaned.length < 20) {
      toast("error", "That token looks too short", "Run `npm run agent` and copy the pairing token it prints.");
      return;
    }
    setToken(cleaned);
    sessionStorage.setItem(TOKEN_KEY, cleaned);
    setTokenReady(true);
    toast("success", "Token saved for this tab");
  }

  function changeToken() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken("");
    setTokenReady(false);
    setAgents([]);
    setInstalled(null);
    setConnectionError(null);
    autoDetected.current = false;
  }

  async function install(hostsToInstall: string[]) {
    if (!hostsToInstall.length) return;
    setBusy("install");
    setResults([]);
    try {
      const data = await call("/api/install", {
        method: "POST",
        body: JSON.stringify({ slug, hosts: hostsToInstall, appUrl: window.location.origin }),
      });
      const list = normalizeResults(data);
      setResults(list);
      const ok = list.filter((item) => item.ok).length;
      if (ok > 0) toast("success", `Installed in ${ok} agent${ok > 1 ? "s" : ""}`);
      const failures = list.filter((item) => !item.ok);
      if (failures.length) toast("error", "Some installs failed", failures.map((item) => item.message).join(" · "));
      await detect();
    } catch (error) {
      toast("error", "Install failed", error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  const manual = hosts[manualHost];
  const selectedHosts = Object.entries(selection)
    .filter(([, value]) => value)
    .map(([host]) => host);

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Install {name}</h2>
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
              {currentVersion ? `${currentVersion.versionLabel} · ${currentVersion.fileCount} files` : "No published version"}
            </p>
          </div>
          {installed ? <PackageCheck className="size-5 text-success" /> : null}
        </div>
        <div className="mt-3 flex gap-1 rounded-lg bg-muted p-1 text-[11px]" role="tablist" aria-label="Install method">
          {([
            ["companion", "Companion"],
            ["manual", "Manual"],
            ["download", "Download"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "flex-1 rounded-md px-2 py-1.5 font-medium transition-colors",
                tab === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {tab === "companion" ? (
          !canDownload ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-warning/25 bg-warning/5 p-3 text-xs">
                <p className="font-medium text-warning">Source-only skill</p>
                <p className="mt-1 text-muted-foreground">
                  No permissive license was detected, so the marketplace cannot mirror or install this skill. Use the
                  original repository and its install instructions instead.
                </p>
                <a
                  href={repositoryUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-2 inline-flex items-center gap-1 text-accent hover:underline"
                >
                  Open original source <ExternalLink className="size-3" />
                </a>
              </div>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Manual paths and source instructions are available in the Manual tab. The companion refuses manifests that
                are not licensed for redistribution.
              </p>
            </div>
          ) : (
          <div className="space-y-4">
            {!tokenReady ? (
              <div className="space-y-3">
                <div className="flex items-start gap-2 rounded-lg border border-accent/20 bg-accent-soft/50 p-3">
                  <Terminal className="mt-0.5 size-4 shrink-0 text-accent" />
                  <div className="min-w-0 text-xs">
                    <p className="font-medium text-foreground">Start the local companion</p>
                    <p className="mt-1 text-muted-foreground">
                      It detects your agents and installs files locally. The web app never writes to your disk.
                    </p>
                    <div className="mt-2 flex items-center gap-1.5">
                      <code className="rounded border border-border bg-card px-1.5 py-1 font-mono text-[10px]">npm run agent</code>
                      <CopyButton value="npm run agent" label="Copy" />
                    </div>
                  </div>
                </div>
                <div>
                  <Label htmlFor="agent-token">Pairing token</Label>
                  <Input
                    id="agent-token"
                    type="password"
                    autoComplete="off"
                    placeholder="Paste the token printed by the companion"
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Kept in this browser tab only. Required on every request; never stored by the marketplace.
                  </p>
                </div>
                <Button onClick={saveToken} className="w-full">
                  Connect companion
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                    <span className={cn("size-1.5 rounded-full", agents.length ? "bg-success" : "bg-warning")} />
                    {AGENT_URL.replace("http://", "")}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" onClick={detect} disabled={busy === "detect"}>
                      {busy === "detect" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                      Detect agents
                    </Button>
                    <Button size="sm" variant="ghost" onClick={changeToken}>
                      Change token
                    </Button>
                  </div>
                </div>

                {connectionError ? (
                  <div className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/5 p-3 text-xs text-danger">
                    <Unplug className="mt-0.5 size-4 shrink-0" />
                    <div>
                      <p className="font-medium">Companion not reachable</p>
                      <p className="mt-1 text-danger/80">{connectionError}</p>
                      <p className="mt-1.5 text-muted-foreground">
                        Run <code className="font-mono">npm run agent</code> in the project, then paste its token again.
                      </p>
                      <Button size="sm" variant="outline" className="mt-2" onClick={changeToken}>
                        Change token
                      </Button>
                    </div>
                  </div>
                ) : null}

                {agents.length ? (
                  <div className="space-y-1.5">
                    {agents.map((agent) => {
                      const compat = compatibility.find((item) => item.host === agent.host);
                      const selectable = agent.detected && compat?.status === "VERIFIED";
                      return (
                        <label
                          key={agent.host}
                          className={cn(
                            "flex items-center gap-3 rounded-lg border border-border p-2.5 text-xs",
                            !agent.detected && "opacity-55",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="size-3.5 accent-[var(--accent)]"
                            disabled={!selectable}
                            checked={Boolean(selection[agent.host])}
                            onChange={(event) =>
                              setSelection((current) => ({ ...current, [agent.host]: event.target.checked }))
                            }
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 font-medium">
                              {agent.name}
                              <span className={cn("size-1.5 rounded-full", agent.detected ? "bg-success" : "bg-border")} />
                              <span className="text-[10px] font-normal text-muted-foreground">
                                {agent.detected ? `Detected${agent.version ? ` · ${agent.version}` : ""}` : "Not installed"}
                              </span>
                            </span>
                            <span className="mt-0.5 block truncate font-mono text-[9px] text-muted-foreground">
                              {agent.skillsPath ?? agent.notes[0] ?? "—"}
                            </span>
                          </span>
                          {compat ? <CompatBadge status={compat.status} /> : null}
                        </label>
                      );
                    })}
                  </div>
                ) : !connectionError ? (
                  <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                    Click detect to scan this computer for supported agents.
                  </p>
                ) : null}

                <div className="space-y-2">
                  <Button
                    className="w-full"
                    disabled={!selectedHosts.length || busy === "install"}
                    onClick={() => install(selectedHosts)}
                  >
                    {busy === "install" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                    {busy === "install" ? "Installing…" : `Install in ${selectedHosts.length || "selected"} agent${selectedHosts.length === 1 ? "" : "s"}`}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={!compatible.length || busy === "install"}
                    onClick={() => install(compatible.map((item) => item.host))}
                  >
                    Install in all compatible agents
                  </Button>
                </div>

                {installed ? (
                  <div className="rounded-lg border border-success/20 bg-success/5 p-2.5 text-[11px] text-success">
                    Installed {installed.versionLabel} in {hostLabel(installed.host)} on {formatDate(installed.updatedAt)}.
                  </div>
                ) : null}
                {results.length ? (
                  <ul className="space-y-1 text-[11px]">
                    {results.map((result) => (
                      <li key={result.host} className={cn("flex items-start gap-1.5", result.ok ? "text-success" : "text-danger")}>
                        {result.ok ? <Check className="mt-0.5 size-3 shrink-0" /> : <CircleAlert className="mt-0.5 size-3 shrink-0" />}
                        <span>
                          <strong className="font-medium">{hostLabel(result.host)}:</strong> {result.message}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  Files are checksum-verified, path-validated, backed up and logged. Skill contents are never executed.
                  Verify anything you install before use.
                </p>
              </>
            )}
          </div>
          )
        ) : null}

        {tab === "manual" ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor="manual-host">Target agent</Label>
              <select
                id="manual-host"
                value={manualHost}
                onChange={(event) => setManualHost(event.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-card px-2.5 text-sm"
              >
                {compatibility.map((item) => (
                  <option key={item.host} value={item.host}>
                    {hosts[item.host]?.name ?? item.host} — {item.status === "VERIFIED" ? "format verified" : item.status.toLowerCase()}
                  </option>
                ))}
              </select>
            </div>
            {manual ? (
              <>
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">User skills directory</p>
                  <code className="mt-1 block break-all font-mono text-[11px]">{manual.userPath}/{slug}</code>
                  {manual.projectPath ? (
                    <>
                      <p className="mt-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Project directory</p>
                      <code className="mt-1 block break-all font-mono text-[11px]">{manual.projectPath}/{slug}</code>
                    </>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <CopyButton value={`mkdir -p "${manual.userPath}/${slug}"`} label="Copy mkdir" className="flex-1" />
                  <a
                    href={manual.docsUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground"
                  >
                    Host docs <ExternalLink className="size-3" />
                  </a>
                </div>
              </>
            ) : null}
            <p className="text-[10px] text-muted-foreground">
              Manual installs are not tracked. Use the companion for verified checksums, backups and updates.
            </p>
          </div>
        ) : null}

        {tab === "download" ? (
          <div className="space-y-3">
            {canDownload ? (
              <>
                <a
                  href={`/api/v1/skills/${slug}/download`}
                  className="flex h-9 items-center justify-center gap-2 rounded-lg bg-accent text-sm font-medium text-accent-foreground transition hover:brightness-110"
                >
                  <Download className="size-4" /> Download ZIP
                </a>
                <p className="text-[10px] text-muted-foreground">
                  Exported under <span className="font-mono">{license}</span>. Attribution and NOTICE files are included.
                  Verify files before running anything.
                </p>
              </>
            ) : (
              <div className="rounded-lg border border-warning/25 bg-warning/5 p-3 text-xs">
                <p className="font-medium text-warning">Source-only distribution</p>
                <p className="mt-1 text-muted-foreground">
                  {license
                    ? `The source license (${license}) does not allow us to mirror the files.`
                    : "No permissive license was detected for this source."}{" "}
                  Install instructions and source links are still available.
                </p>
                <a
                  href={repositoryUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-2 inline-flex items-center gap-1 text-accent hover:underline"
                >
                  Open original source <ExternalLink className="size-3" />
                </a>
              </div>
            )}
            <div className="rounded-lg border border-border p-3 text-[11px] text-muted-foreground">
              <p className="font-medium text-foreground">Provenance</p>
              <a href={sourceUrl} target="_blank" rel="noreferrer noopener" className="mt-1 inline-flex items-center gap-1 break-all text-accent hover:underline">
                {sourceUrl} <ExternalLink className="size-3 shrink-0" />
              </a>
              <p className="mt-1">Published {formatDate(currentVersion?.publishedAt ?? null)} · {currentVersion?.totalBytes ?? 0} bytes</p>
            </div>
            {!isAuthed ? (
              <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <ArrowRight className="size-3" /> Sign in to save skills and follow updates.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1 border-t border-border bg-muted/30 px-4 py-2.5">
        {compatibility
          .filter((item) => item.status === "VERIFIED")
          .map((item) => (
            <HostBadge key={item.host} host={item.host} />
          ))}
      </div>
    </Card>
  );
}

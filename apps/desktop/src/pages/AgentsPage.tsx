import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  BookOpen,
  Bot,
  Cpu,
  Info,
  Plus,
  RefreshCw,
  Terminal,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useAppData } from "../app/app-context";
import { PageHeader } from "../components/layout/PageHeader";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { EmptyState } from "../components/ui/EmptyState";
import { Field, Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Skeleton } from "../components/ui/Skeleton";
import { Switch } from "../components/ui/Switch";
import { useToast } from "../components/ui/Toast";
import { HOSTS, hostName } from "../lib/constants";
import { cx } from "../lib/cx";
import { errorMessage, formatNumber } from "../lib/format";
import { ipc } from "../lib/ipc";
import type { DetectedAgent } from "../lib/types";

const SKILL_FOLDERS = [
  { name: "Claude Code", folder: "~/.claude/skills" },
  { name: "OpenAI Codex", folder: "~/.agents/skills" },
  { name: "OpenCode", folder: "~/.config/opencode/skills" },
  { name: "Cursor", folder: "~/.cursor/skills" },
  { name: "Windsurf / Devin Desktop", folder: "~/.codeium/windsurf/skills" },
  { name: "GitHub Copilot", folder: "~/.copilot/skills" },
  { name: "Gemini CLI", folder: "~/.gemini/skills" },
];

export default function AgentsPage() {
  const { revision, refresh } = useAppData();
  const toast = useToast();
  const [agents, setAgents] = useState<DetectedAgent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingHost, setTogglingHost] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualHost, setManualHost] = useState("claude-code");
  const [manualExecutable, setManualExecutable] = useState("");
  const [manualSkills, setManualSkills] = useState("");
  const [manualSaving, setManualSaving] = useState(false);

  const detect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await ipc.detectAgents();
      setAgents(result);
    } catch (reason) {
      setAgents(null);
      setError(errorMessage(reason, "Agent detection failed."));
      setLoading(false);
      return;
    }
    setLoading(false);
    try {
      const scan = await ipc.scanInstalledSkills();
      if (scan.imported > 0) {
        toast.success(
          "Existing skills found",
          `${scan.imported} skill${scan.imported === 1 ? "" : "s"} already on disk were added to the Library.`,
        );
        await refresh();
      }
    } catch {
      // Detection still works even if an agent's skills folder cannot be scanned.
    }
  }, [refresh, toast]);

  useEffect(() => {
    void detect();
  }, [detect, revision]);

  const setAutoInstall = async (agent: DetectedAgent, enabled: boolean) => {
    setTogglingHost(agent.host);
    try {
      const result = await ipc.setAgentAutoInstall(agent.host, enabled);
      setAgents(result);
      toast.success(
        enabled ? "Auto-update enabled" : "Auto-update disabled",
        `${agent.name || hostName(agent.host)} will ${enabled ? "now" : "no longer"} auto-update installed skills after a sync.`,
      );
    } catch (reason) {
      toast.error("Could not update auto-update", errorMessage(reason));
    } finally {
      setTogglingHost(null);
    }
  };

  const detected = (agents ?? []).filter((agent) => agent.detected);
  const undetected = (agents ?? []).filter((agent) => !agent.detected);

  const openManual = (host?: string) => {
    const targetHost = host ?? undetected[0]?.host ?? HOSTS[0]?.id ?? "claude-code";
    const agent = agents?.find((item) => item.host === targetHost);
    setManualHost(targetHost);
    setManualExecutable(agent?.executablePath ?? "");
    setManualSkills(agent?.skillsPath ?? "");
    setManualOpen(true);
  };

  const changeManualHost = (host: string) => {
    const agent = agents?.find((item) => item.host === host);
    setManualHost(host);
    setManualExecutable(agent?.executablePath ?? "");
    setManualSkills(agent?.skillsPath ?? "");
  };

  const saveManual = async () => {
    setManualSaving(true);
    try {
      const result = await ipc.setManualAgent(
        manualHost,
        manualExecutable.trim() || null,
        manualSkills.trim() || null,
      );
      setAgents(result);
      setManualOpen(false);
      toast.success(
        "Agent added manually",
        `${hostName(manualHost)} is now available for installs. You can remove the manual entry at any time.`,
      );
    } catch (reason) {
      toast.error("Could not add the agent", errorMessage(reason));
    } finally {
      setManualSaving(false);
    }
  };

  const clearManual = async (agent: DetectedAgent) => {
    try {
      const result = await ipc.clearManualAgent(agent.host);
      setAgents(result);
      toast.success("Manual entry removed", `${agent.name || hostName(agent.host)} was returned to normal detection.`);
    } catch (reason) {
      toast.error("Could not remove the manual entry", errorMessage(reason));
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Manage"
        title="My Agents"
        description="Detection is evidence-based: an executable or a documented app artifact. A folder alone never counts."
        meta={
          <span>
            {formatNumber(detected.length)} detected · {formatNumber(agents?.length ?? 0)} probed
          </span>
        }
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setGuideOpen(true)}>
              <BookOpen className="size-3.5" aria-hidden="true" />
              Folder guide
            </Button>
            <Button variant="secondary" size="sm" onClick={() => openManual()}>
              <Plus className="size-3.5" aria-hidden="true" />
              Add manually
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void detect()} loading={loading}>
              {!(loading && !agents) ? <RefreshCw className="size-3.5" aria-hidden="true" /> : null}
              Rescan
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-start gap-3 rounded-xl border border-line bg-surface/40 px-4 py-3">
        <Info className="mt-0.5 size-4 shrink-0 text-brand-soft/75" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-text">Only detected or manually added agents can receive installs</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
            Skills Launcher looks for a real installed app or executable, not just a config folder. If your agent is
            installed in a non-standard place, add it manually below. Manual entries use the skills folder you provide;
            it must stay inside your home directory.
          </p>
        </div>
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setGuideOpen(true)}>
          <BookOpen className="size-3" aria-hidden="true" />
          Where to look
        </Button>
      </div>

      {error ? (
        <EmptyState
          icon={TriangleAlert}
          title="Could not detect agents"
          description={error}
          action={
            <Button variant="secondary" onClick={() => void detect()}>
              Retry detection
            </Button>
          }
          hint="Detection runs locally. No executable or app content leaves this machine."
        />
      ) : loading && !agents ? (
        <div className="grid gap-3 md:grid-cols-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-[14px] border border-line bg-surface/40 p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-2 w-1/4" />
                </div>
              </div>
              <Skeleton className="mt-4 h-2.5 w-full" />
              <Skeleton className="mt-2 h-2.5 w-4/5" />
              <Skeleton className="mt-4 h-8 w-full" />
            </div>
          ))}
        </div>
      ) : !agents || agents.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            icon={Bot}
            title="No supported agents detected"
            description="Nothing matched on this machine. Install or start a supported agent, then rescan. Runtime evidence is required; an empty skill folder is not detection."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="secondary" onClick={() => openManual()}>
                  <Plus className="size-3.5" aria-hidden="true" />
                  Add manually
                </Button>
                <Button variant="secondary" onClick={() => void detect()}>
                  Rescan agents
                </Button>
              </div>
            }
          />
          <div className="rounded-[14px] border border-line bg-surface/35 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-soft">
              Hosts probed
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {HOSTS.map((host) => (
                <Badge key={host.id} tone="outline">
                  {host.name}
                </Badge>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-soft">
              Detection is tied to the machine running the desktop app. If an agent lives in a remote
              container or another user profile, it cannot be detected here.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {detected.length > 0 ? (
            <div className={detected.length === 1 ? "" : "grid items-start gap-3 md:grid-cols-2"}>
              {detected.map((agent) => (
                <DetectedAgentCard
                  key={agent.host}
                  agent={agent}
                  toggling={togglingHost !== null}
                  onToggleAutoInstall={(checked) => void setAutoInstall(agent, checked)}
                  onRemoveManual={() => void clearManual(agent)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Bot}
              title="No agent runtime found"
              description="None of the supported runtimes produced executable evidence. Install or start an agent, then rescan. A skills folder or config directory alone is not enough."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="secondary" onClick={() => openManual()}>
                    <Plus className="size-3.5" aria-hidden="true" />
                    Add manually
                  </Button>
                  <Button variant="secondary" onClick={() => void detect()}>
                    Rescan agents
                  </Button>
                </div>
              }
            />
          )}

          {undetected.length > 0 ? (
            <section className="overflow-hidden rounded-[14px] border border-line/70 bg-surface/25">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 px-4 py-3">
                <div>
                  <h2 className="flex items-center gap-2 text-[12px] font-semibold text-text">
                    Not detected on this machine
                    <Badge tone="neutral">{undetected.length}</Badge>
                  </h2>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                    No runtime evidence found. If one is installed in a custom location, add it manually.
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => void detect()}>
                  Rescan
                </Button>
              </div>
              <div className="grid sm:grid-cols-2">
                {undetected.map((agent) => (
                  <div
                    key={agent.host}
                    className="flex min-w-0 items-center gap-3 border-b border-line/50 px-4 py-3 last:border-b-0 sm:odd:border-r"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-elevated/35 text-muted-soft">
                      <Bot className="size-3.5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium text-text/85">
                        {agent.name || hostName(agent.host)}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-muted-soft">
                        {agent.host}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="hidden text-[11px] text-muted-soft sm:inline">No runtime</span>
                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openManual(agent.host)}>
                        <Plus className="size-3" aria-hidden="true" />
                        Add manually
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      <div className="rounded-[13px] border border-line bg-surface/30 px-4 py-3">
        <p className="text-[11px] leading-relaxed text-muted-soft">
          Auto-update applies after a successful source sync. It updates existing installations for
          this host only; undetected hosts receive no writes and no skill content is executed.
        </p>
      </div>

      <Dialog
        open={guideOpen}
        onOpenChange={setGuideOpen}
        title="Where agent skills live"
        description="Detection uses runtime evidence. Skill folders are where the app reads existing skills and installs new ones."
        size="lg"
        footer={
          <Button variant="primary" onClick={() => setGuideOpen(false)}>
            Got it
          </Button>
        }
      >
        <div className="space-y-5">
          <section>
            <h3 className="text-[12px] font-semibold text-text">How detection works</h3>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
              Skills Launcher probes for a real executable on PATH or a known application artifact. A folder by itself
              never marks an agent detected. If you already have skills in a supported folder, the Library scan can
              still import them as <strong className="font-medium text-text">Found on disk</strong>.
            </p>
          </section>

          <section className="overflow-hidden rounded-lg border border-line">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-line/70 bg-elevated/40 px-3 py-2 text-[10.5px] font-medium text-muted">
              <span>Agent</span>
              <span>User skills folder</span>
            </div>
            {SKILL_FOLDERS.map((item) => (
              <div
                key={item.name}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-line/50 px-3 py-2 text-[11.5px] last:border-b-0"
              >
                <span className="text-text">{item.name}</span>
                <code className="font-mono text-[10.5px] text-muted">{item.folder}</code>
              </div>
            ))}
          </section>

          <section>
            <h3 className="text-[12px] font-semibold text-text">What <code className="font-mono">~</code> means</h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {[
                ["Windows", "C:\\Users\\<you>", "C:\\Users\\<you>\\.claude\\skills"],
                ["macOS", "/Users/<you>", "/Users/<you>/.claude/skills"],
                ["Linux", "/home/<you>", "/home/<you>/.claude/skills"],
              ].map(([system, home, example]) => (
                <div key={system} className="rounded-lg border border-line bg-elevated/25 p-3">
                  <p className="text-[11px] font-medium text-text">{system}</p>
                  <code className="mt-1 block font-mono text-[10.5px] text-muted">{home}</code>
                  <p className="mt-2 text-[10.5px] leading-relaxed text-muted-soft">
                    Example: <code className="break-all font-mono">{example}</code>
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-brand/20 bg-brand/[0.055] p-3.5">
            <h3 className="text-[12px] font-semibold text-text">If My Agents says “Not detected”</h3>
            <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-[11.5px] leading-relaxed text-muted">
              <li>Install the real agent executable, then retry <strong className="font-medium text-text">Rescan</strong>.</li>
              <li>If it uses a non-standard install location, click <strong className="font-medium text-text">Add manually</strong>.</li>
              <li>Choose the agent and set its user skills folder. The executable path is optional and is never executed.</li>
              <li>Save. The card becomes <strong className="font-medium text-text">Manual entry</strong> and can receive installs.</li>
            </ol>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => {
                setGuideOpen(false);
                openManual();
              }}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Open Add manually
            </Button>
          </section>

          <p className="text-[10.5px] leading-relaxed text-muted-soft">
            Only user-level roots are scanned and written. Project folders such as <code className="font-mono">.claude/skills</code>{" "}
            inside a repository can be added as a local Source if you want them in the catalog. Manual skills folders must
            be absolute and inside your home directory.
          </p>
        </div>
      </Dialog>

      <Dialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        title="Add agent manually"
        description="Override detection for a supported agent when it is installed in a non-standard location."
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setManualOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={manualSaving} onClick={() => void saveManual()}>
              Save agent
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Agent" htmlFor="manual-agent">
            <Select
              id="manual-agent"
              value={manualHost}
              onChange={(event) => changeManualHost(event.target.value)}
              options={HOSTS.map((host) => ({ value: host.id, label: host.name }))}
            />
          </Field>
          <Field
            label="Executable path"
            htmlFor="manual-executable"
            optional
            hint="Absolute path to the agent executable. Leave blank to trust the skills folder alone."
          >
            <Input
              id="manual-executable"
              value={manualExecutable}
              onChange={(event) => setManualExecutable(event.target.value)}
              placeholder={manualHost === "opencode" ? "C:\\Users\\you\\AppData\\Local\\...\\opencode.exe" : "C:\\path\\to\\agent.exe"}
              spellCheck={false}
              autoComplete="off"
            />
          </Field>
          <Field
            label="Skills folder"
            htmlFor="manual-skills"
            hint="Absolute folder where this agent loads user skills. It must stay inside your home directory."
          >
            <Input
              id="manual-skills"
              value={manualSkills}
              onChange={(event) => setManualSkills(event.target.value)}
              placeholder={agents?.find((agent) => agent.host === manualHost)?.skillsPath ?? ""}
              spellCheck={false}
              autoComplete="off"
            />
          </Field>
          <p className="rounded-lg border border-warn/25 bg-warn/[0.055] px-3 py-2.5 text-[11px] leading-relaxed text-muted">
            Manual entries override runtime detection but are not verified by Skills Launcher. The app never executes
            the executable path; it only uses the skills folder for installs.
          </p>
        </div>
      </Dialog>
    </div>
  );
}

function DetectedAgentCard({
  agent,
  toggling,
  onToggleAutoInstall,
  onRemoveManual,
}: {
  agent: DetectedAgent;
  toggling: boolean;
  onToggleAutoInstall: (checked: boolean) => void;
  onRemoveManual: () => void;
}) {
  return (
    <article className="flex h-full flex-col rounded-[14px] border border-line bg-surface/55 p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-brand/30 bg-brand/10 text-brand-soft">
          <Bot className="size-[17px]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[13px] font-semibold text-text">
            {agent.name || hostName(agent.host)}
          </h2>
          <p className="mt-0.5 font-mono text-[11px] text-muted">{agent.host}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Badge tone={agent.manual ? "warn" : "ok"} dot>
            {agent.manual ? "Manual entry" : "Detected"}
          </Badge>
          {agent.supportsAgentSkills ? (
            <Badge tone="brand">Format: Agent Skills</Badge>
          ) : (
            <Badge tone="outline">Export only</Badge>
          )}
        </div>
      </div>

      <dl className="mt-4 space-y-2.5 border-t border-line/60 pt-3">
        <EvidenceRow
          label="Executable"
          value={agent.executablePath}
          extra={agent.version ? <Badge tone="neutral">{agent.version}</Badge> : null}
          mono
          icon={<Terminal className="size-3" aria-hidden="true" />}
        />
        <EvidenceRow label="Config" value={agent.configPath} mono />
        <EvidenceRow label="Skills" value={agent.skillsPath} mono />
        <EvidenceRow label="Project" value={agent.projectSkillsPath} mono />
      </dl>

      {agent.notes.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-line/60 pt-3">
          {agent.notes.map((note, index) => (
            <li key={index} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-soft">
              <Info className="mt-0.5 size-3 shrink-0 text-brand-soft/50" aria-hidden="true" />
              {note}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line/60 pt-3">
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <Cpu className="size-3 text-muted-soft" aria-hidden="true" />
          {agent.autoInstall ? "Auto-update is on" : "Manual updates"}
        </div>
        <div className="flex items-center gap-2">
          {agent.manual ? (
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onRemoveManual}>
              <Trash2 className="size-3" aria-hidden="true" />
              Remove manual
            </Button>
          ) : null}
          {agent.supportsAgentSkills ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted">Auto-update</span>
              <Switch
                checked={agent.autoInstall}
                onCheckedChange={onToggleAutoInstall}
                disabled={toggling}
                label={`Toggle auto-update for ${agent.name || hostName(agent.host)}`}
              />
            </div>
          ) : (
            <span className="text-[11px] text-muted-soft">No automatic writes</span>
          )}
        </div>
      </div>
    </article>
  );
}

function EvidenceRow({
  label,
  value,
  extra,
  mono = false,
  icon,
}: {
  label: string;
  value: string | null;
  extra?: ReactNode;
  mono?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-3">
      <dt className="flex w-[86px] shrink-0 items-center gap-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft">
        {icon}
        {label}
      </dt>
      <dd
        className={cx(
          "min-w-0 flex-1 truncate text-[11px]",
          mono && "font-mono text-[11px]",
          value ? "text-muted" : "text-muted-soft",
        )}
        title={value ?? undefined}
      >
        {value ?? "Not reported"}
      </dd>
      {extra ? <div className="shrink-0">{extra}</div> : null}
    </div>
  );
}

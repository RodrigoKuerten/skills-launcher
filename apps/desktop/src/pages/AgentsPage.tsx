import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Bot,
  CircleAlert,
  Cpu,
  Info,
  RefreshCw,
  Terminal,
  TriangleAlert,
} from "lucide-react";
import { useAppData } from "../app/app-context";
import { PageHeader } from "../components/layout/PageHeader";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { Skeleton } from "../components/ui/Skeleton";
import { Switch } from "../components/ui/Switch";
import { useToast } from "../components/ui/Toast";
import { HOSTS, hostName } from "../lib/constants";
import { cx } from "../lib/cx";
import { errorMessage, formatNumber } from "../lib/format";
import { ipc } from "../lib/ipc";
import type { DetectedAgent } from "../lib/types";

export default function AgentsPage() {
  const { revision } = useAppData();
  const toast = useToast();
  const [agents, setAgents] = useState<DetectedAgent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingHost, setTogglingHost] = useState<string | null>(null);

  const detect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await ipc.detectAgents();
      setAgents(result);
    } catch (reason) {
      setAgents(null);
      setError(errorMessage(reason, "Agent detection failed."));
    } finally {
      setLoading(false);
    }
  }, []);

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
          <Button variant="secondary" size="sm" onClick={() => void detect()} loading={loading}>
            {!(loading && !agents) ? <RefreshCw className="size-3.5" aria-hidden="true" /> : null}
            Rescan
          </Button>
        }
      />

      <div className="flex items-start gap-3 rounded-xl border border-line bg-surface/40 px-4 py-3">
        <Info className="mt-0.5 size-4 shrink-0 text-brand-soft/75" aria-hidden="true" />
        <div>
          <p className="text-[11px] font-medium text-text">How detection works</p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-muted">
            Skills Launcher probes supported agent executables, versions and documented configuration
            artifacts. Automatic installs are only offered for detected runtimes that support Agent
            Skills. Everything else stays export-only.
          </p>
        </div>
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
              <Button variant="secondary" onClick={() => void detect()}>
                Rescan agents
              </Button>
            }
          />
          <div className="rounded-[14px] border border-line bg-surface/35 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted/60">
              Hosts probed
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {HOSTS.map((host) => (
                <Badge key={host.id} tone="outline">
                  {host.name}
                </Badge>
              ))}
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-muted/60">
              Detection is tied to the machine running the desktop app. If an agent lives in a remote
              container or another user profile, it cannot be detected here.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid items-start gap-3 md:grid-cols-2">
          {agents
            .slice()
            .sort((a, b) => Number(b.detected) - Number(a.detected))
            .map((agent) => {
              const notes = agent.detected
                ? agent.notes
                : agent.notes.filter(
                    (note) => !/no executable|app artifact|not detected/i.test(note),
                  );
              return (
              <article
                key={agent.host}
                className={cx(
                  "flex h-full flex-col rounded-[14px] border p-4",
                  agent.detected
                    ? "border-line bg-surface/55"
                    : "border-line/70 bg-surface/25 opacity-80",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cx(
                      "grid size-9 shrink-0 place-items-center rounded-[10px] border",
                      agent.detected
                        ? "border-brand/30 bg-brand/10 text-brand-soft"
                        : "border-line bg-elevated/40 text-muted/60",
                    )}
                  >
                    <Bot className="size-[17px]" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[13px] font-semibold text-text">
                      {agent.name || hostName(agent.host)}
                    </h2>
                    <p className="mt-0.5 font-mono text-[9.5px] text-muted/60">{agent.host}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Badge tone={agent.detected ? "ok" : "neutral"} dot>
                      {agent.detected ? "Detected" : "Not detected"}
                    </Badge>
                    {agent.supportsAgentSkills ? (
                      <Badge tone="brand">Format: Agent Skills</Badge>
                    ) : (
                      <Badge tone="outline">Export only</Badge>
                    )}
                  </div>
                </div>

                {agent.detected ? (
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
                ) : (
                  <div className="mt-4 flex items-start gap-2 border-t border-line/60 pt-3 text-[10.5px] leading-relaxed text-muted">
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-muted/60" aria-hidden="true" />
                    No executable or documented app artifact was found for this host.
                  </div>
                )}

                {notes.length > 0 ? (
                  <ul className="mt-3 space-y-1 border-t border-line/60 pt-3">
                    {notes.map((note, index) => (
                      <li key={index} className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted/75">
                        <Info className="mt-0.5 size-3 shrink-0 text-brand-soft/50" aria-hidden="true" />
                        {note}
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="mt-auto flex items-center justify-between gap-3 border-t border-line/60 pt-3">
                  <div className="flex items-center gap-2 text-[10px] text-muted">
                    <Cpu className="size-3 text-muted/60" aria-hidden="true" />
                    {agent.detected
                      ? agent.autoInstall
                        ? "Auto-update is on"
                        : "Manual updates"
                      : "Unavailable"}
                  </div>
                  {agent.detected && agent.supportsAgentSkills ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted">Auto-update</span>
                      <Switch
                        checked={agent.autoInstall}
                        onCheckedChange={(checked) => void setAutoInstall(agent, checked)}
                        disabled={togglingHost !== null}
                        label={`Toggle auto-update for ${agent.name || hostName(agent.host)}`}
                      />
                    </div>
                  ) : (
                    <span className="text-[10px] text-muted/55">
                      {agent.detected ? "No automatic writes" : "Not writable"}
                    </span>
                  )}
                </div>
              </article>
              );
            })}
        </div>
      )}

      <div className="rounded-[13px] border border-line bg-surface/30 px-4 py-3">
        <p className="text-[10px] leading-relaxed text-muted/60">
          Auto-update applies after a successful source sync. It updates existing installations for
          this host only; undetected hosts receive no writes and no skill content is executed.
        </p>
      </div>
    </div>
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
    <div className="flex min-w-0 items-baseline gap-2">
      <dt className="flex w-[64px] shrink-0 items-center gap-1 text-[9px] font-medium uppercase tracking-[0.08em] text-muted/50">
        {icon}
        {label}
      </dt>
      <dd
        className={cx(
          "min-w-0 flex-1 truncate text-[10.5px]",
          mono && "font-mono text-[9.5px]",
          value ? "text-muted" : "text-muted/40",
        )}
        title={value ?? undefined}
      >
        {value ?? "Not reported"}
      </dd>
      {extra ? <div className="shrink-0">{extra}</div> : null}
    </div>
  );
}

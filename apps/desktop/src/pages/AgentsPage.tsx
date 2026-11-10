import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Bot,
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
  const undetected = (agents ?? []).filter((agent) => !agent.detected);

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
          <p className="text-[11px] font-medium text-text">Only detected agents can receive installs</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
            Skills Launcher looks for a real installed app or executable, not just a config folder.
            Everything else stays read-only and export-only.
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
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Bot}
              title="No agent runtime found"
              description="None of the supported runtimes produced executable evidence. Install or start an agent, then rescan. A skills folder or config directory alone is not enough."
              action={
                <Button variant="secondary" onClick={() => void detect()}>
                  Rescan agents
                </Button>
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
                    No runtime evidence. These hosts are listed for reference only and receive no writes.
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
                    <span className="text-[11px] text-muted-soft">No runtime</span>
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
    </div>
  );
}

function DetectedAgentCard({
  agent,
  toggling,
  onToggleAutoInstall,
}: {
  agent: DetectedAgent;
  toggling: boolean;
  onToggleAutoInstall: (checked: boolean) => void;
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
          <Badge tone="ok" dot>
            Detected
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

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Check,
  CircleAlert,
  Cpu,
  Download,
  ExternalLink as ExternalLinkIcon,
  FolderOpen,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useAppData } from "../app/app-context";
import { ExternalLink } from "./ExternalLink";
import { RiskBadge } from "./RiskBadge";
import { SafeMarkdown } from "./SafeMarkdown";
import { TrustBadge } from "./TrustBadge";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Sheet } from "./ui/Dialog";
import { EmptyState } from "./ui/EmptyState";
import { Progress } from "./ui/Progress";
import { Skeleton } from "./ui/Skeleton";
import { Switch } from "./ui/Switch";
import { useToast } from "./ui/Toast";
import { SOURCE_KIND_LABEL, hostName } from "../lib/constants";
import { cx } from "../lib/cx";
import {
  errorMessage,
  formatDate,
  formatNumber,
  formatRelative,
  truncateMiddle,
} from "../lib/format";
import { ipc } from "../lib/ipc";
import { navigate } from "../lib/router";
import type { DetectedAgent, SkillDetail } from "../lib/types";

export interface SkillDetailSheetProps {
  skillId: string | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

export function SkillDetailSheet({ skillId, onOpenChange, onChanged }: SkillDetailSheetProps) {
  const { bootstrap } = useAppData();
  const toast = useToast();
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<DetectedAgent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [selectedHosts, setSelectedHosts] = useState<string[]>([]);
  const [allowRisky, setAllowRisky] = useState(false);
  const [installing, setInstalling] = useState(false);
  const detailRequest = useRef(0);
  const agentRequest = useRef(0);
  const selectionInitialized = useRef(false);

  const loadDetail = useCallback(async (id: string) => {
    const request = ++detailRequest.current;
    setLoading(true);
    setError(null);
    try {
      const result = await ipc.getSkill(id);
      if (detailRequest.current !== request) return;
      setDetail(result);
    } catch (reason) {
      if (detailRequest.current !== request) return;
      setDetail(null);
      setError(errorMessage(reason, "Could not read this skill."));
    } finally {
      if (detailRequest.current === request) setLoading(false);
    }
  }, []);

  const loadAgents = useCallback(async () => {
    const request = ++agentRequest.current;
    setAgentsLoading(true);
    setAgentsError(null);
    try {
      const result = await ipc.detectAgents();
      if (agentRequest.current !== request) return;
      setAgents(result);
    } catch (reason) {
      if (agentRequest.current !== request) return;
      setAgents([]);
      setAgentsError(errorMessage(reason, "Agent detection is unavailable."));
    } finally {
      if (agentRequest.current === request) setAgentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!skillId) return;
    setDetail(null);
    setError(null);
    setSelectedHosts([]);
    setAllowRisky(false);
    setAgents([]);
    setAgentsError(null);
    selectionInitialized.current = false;
    void loadDetail(skillId);
    void loadAgents();
  }, [skillId, loadDetail, loadAgents]);

  useEffect(() => {
    if (agents.length === 0) return;
    if (!selectionInitialized.current) {
      const first = agents.find((agent) => agent.detected && agent.supportsAgentSkills);
      setSelectedHosts(first ? [first.host] : []);
      selectionInitialized.current = true;
      return;
    }
    setSelectedHosts((current) =>
      current.filter((host) =>
        agents.some(
          (agent) => agent.host === host && agent.detected && agent.supportsAgentSkills,
        ),
      ),
    );
  }, [agents]);

  const open = skillId !== null;
  const categoryNames = new Map((bootstrap?.categories ?? []).map((item) => [item.slug, item.name]));
  const latest = detail?.latestVersion ?? null;
  const activeInstallations =
    detail?.installations.filter((installation) => installation.status === "INSTALLED") ?? [];
  const quarantined =
    detail?.status === "QUARANTINED" || latest?.status === "QUARANTINED";
  const risky = detail?.riskLevel === "HIGH" || detail?.riskLevel === "CRITICAL";
  const detected = agents.filter((agent) => agent.detected);
  const installable = detected.filter((agent) => agent.supportsAgentSkills);
  const selectedAgentNames = selectedHosts.map((host) => {
    const agent = agents.find((candidate) => candidate.host === host);
    return agent?.name || hostName(host);
  });
  const selectedLabel =
    selectedAgentNames.length <= 2
      ? selectedAgentNames.join(", ")
      : `${selectedAgentNames[0]} +${selectedAgentNames.length - 1}`;
  const selectedInstalled =
    selectedHosts.length > 0 &&
    selectedHosts.every((host) =>
      activeInstallations.some(
        (installation) => installation.host === host && installation.status === "INSTALLED",
      ),
    );
  const canInstall =
    Boolean(detail && latest && !quarantined && selectedHosts.length > 0) &&
    (!risky || allowRisky);
  const scoreTone =
    detail && detail.securityScore >= 80
      ? "ok"
      : detail && detail.securityScore >= 55
        ? "warn"
        : "danger";

  const toggleHost = (host: string, checked: boolean) => {
    selectionInitialized.current = true;
    setSelectedHosts((current) =>
      checked ? [...new Set([...current, host])] : current.filter((item) => item !== host),
    );
  };

  const install = async () => {
    if (!detail || !canInstall || installing) return;
    setInstalling(true);
    try {
      const response = await ipc.installSkill({
        skillId: detail.id,
        versionId: latest?.id ?? null,
        hosts: selectedHosts,
        allowRisky,
      });
      const succeeded = response.outcomes.filter((outcome) => outcome.ok);
      const failed = response.outcomes.filter((outcome) => !outcome.ok);
      if (succeeded.length > 0) {
        toast.success(
          "Skill installed",
          `Installed on ${succeeded.map((outcome) => hostName(outcome.host)).join(", ")}.`,
        );
      }
      if (failed.length > 0) {
        toast.error(
          "Install did not complete on every agent",
          failed
            .map((outcome) => `${hostName(outcome.host)}: ${outcome.message}`)
            .join(" · "),
        );
      }
      onChanged();
      if (skillId) await loadDetail(skillId);
      await loadAgents();
    } catch (reason) {
      toast.error("Install failed", errorMessage(reason));
    } finally {
      setInstalling(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={detail?.name ?? "Skill detail"}
      description={
        detail
          ? `${detail.sourceName} · ${SOURCE_KIND_LABEL[detail.sourceKind] ?? detail.sourceKind}`
          : "Reading provenance and scan results."
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {activeInstallations.length > 0 ? (
            <Button variant="ghost" onClick={() => navigate("library")}>
              Open Library
            </Button>
          ) : null}
          <Button
            variant="primary"
            onClick={() => void install()}
            loading={installing}
            disabled={!canInstall}
          >
            <Download className="size-3.5" aria-hidden="true" />
            {quarantined
              ? "Install blocked"
              : selectedHosts.length > 0
                ? `${selectedInstalled ? "Reinstall" : "Install"} on ${selectedLabel}`
                : "Select an agent"}
          </Button>
        </>
      }
    >
      {loading ? (
        <DetailSkeleton />
      ) : error ? (
        <EmptyState
          icon={TriangleAlert}
          title="Could not load this skill"
          description={error}
          action={
            skillId ? (
              <Button variant="secondary" onClick={() => void loadDetail(skillId)}>
                Retry
              </Button>
            ) : undefined
          }
        />
      ) : detail ? (
        <div className="space-y-6">
          <section>
            <div className="flex flex-wrap items-center gap-1.5">
              <TrustBadge trust={detail.trust} />
              <RiskBadge risk={detail.riskLevel} />
              {detail.category ? (
                <Badge tone="outline">{categoryNames.get(detail.category) ?? detail.category}</Badge>
              ) : null}
              {detail.archived ? <Badge tone="warn">Archived upstream</Badge> : null}
              {detail.installCount > 0 ? (
                <Badge tone="neutral">
                  {formatNumber(detail.installCount)} local {detail.installCount === 1 ? "install" : "installs"}
                </Badge>
              ) : null}
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-muted">
              {detail.summary || "No description was provided for this skill."}
            </p>
          </section>

          {quarantined ? (
            <div className="flex gap-3 rounded-xl border border-danger/30 bg-danger/[0.07] px-3.5 py-3">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold text-danger">Quarantined version</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                  The scanner blocked this version. It stays visible here for inspection but cannot be
                  installed from Skills Launcher.
                </p>
              </div>
            </div>
          ) : null}

          <section className="rounded-xl border border-line bg-surface/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold text-text">Install targets</h3>
                <p className="mt-0.5 text-[11px] text-muted">
                  Only agents with runtime evidence are listed. A folder alone is not detection.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void loadAgents()}
                loading={agentsLoading}
              >
                Rescan
              </Button>
            </div>

            {agentsLoading ? (
              <div className="mt-3 space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-4/5" />
              </div>
            ) : agentsError ? (
              <div className="mt-3 rounded-lg border border-danger/25 bg-danger/[0.06] px-3 py-2.5">
                <p className="flex items-start gap-2 text-[11px] leading-relaxed text-danger">
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  {agentsError}
                </p>
                <Button variant="secondary" size="sm" className="mt-2" onClick={() => void loadAgents()}>
                  Retry detection
                </Button>
              </div>
            ) : installable.length === 0 ? (
              <div className="mt-3 rounded-lg border border-line bg-canvas/35 px-3 py-3">
                <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted">
                  <Cpu className="mt-0.5 size-3.5 shrink-0 text-brand-soft/70" aria-hidden="true" />
                  {detected.length === 0
                    ? "No supported agent runtime was detected on this machine. Use My Agents to rescan after installing an agent."
                    : "A detected agent does not support the Agent Skills format. It can export skills only."}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1.5"
                  onClick={() => {
                    onOpenChange(false);
                    navigate("agents");
                  }}
                >
                  Open My Agents
                </Button>
              </div>
            ) : (
              <div className="mt-3 space-y-1.5">
                {installable.map((agent) => {
                  const checked = selectedHosts.includes(agent.host);
                  return (
                    <label
                      key={agent.host}
                      className={cx(
                        "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition-colors",
                        checked
                          ? "border-brand/35 bg-brand/[0.06]"
                          : "border-line bg-canvas/25 hover:border-brand/25",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 size-3.5 accent-[#2f6bff]"
                        checked={checked}
                        onChange={(event) => toggleHost(agent.host, event.target.checked)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-text">
                          {agent.name || hostName(agent.host)}
                          {agent.version ? (
                            <span className="font-mono text-[11px] font-normal text-muted">{agent.version}</span>
                          ) : null}
                          {agent.autoInstall ? <Badge tone="brand">Auto-update</Badge> : null}
                        </span>
                        {agent.skillsPath ? (
                          <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-soft" title={agent.skillsPath}>
                            {truncateMiddle(agent.skillsPath, 72)}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {activeInstallations.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-ok/20 bg-ok/[0.045] px-3 py-2.5 text-[11px] text-muted">
                <Badge tone="ok">Installed</Badge>
                <span>
                  On {activeInstallations.map((installation) => hostName(installation.host)).join(", ")}
                  {activeInstallations[0]?.versionLabel
                    ? ` · ${activeInstallations[0].versionLabel}`
                    : ""}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-7"
                  onClick={() => navigate("library")}
                >
                  Open Library
                </Button>
              </div>
            ) : null}

            {risky && !quarantined && latest ? (
              <div className="mt-3 flex items-start gap-3 rounded-lg border border-warn/25 bg-warn/[0.055] px-3 py-2.5">
                <Switch
                  checked={allowRisky}
                  onCheckedChange={setAllowRisky}
                  label="Allow a high-risk install"
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-[11px] font-medium text-warn">Allow high-risk install</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">
                    This version has a {detail.riskLevel.toLowerCase()} risk rating. Read the findings
                    below before continuing.
                  </span>
                </span>
              </div>
            ) : null}
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold text-text">Provenance</h3>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border border-line bg-surface/40 p-4">
              <Meta label="Latest version" value={latest?.versionLabel ?? "No published version"} mono />
              <Meta label="Published" value={latest ? formatRelative(latest.publishedAt ?? latest.createdAt) : "—"} />
              <Meta
                label="License"
                value={detail.license ?? "Not declared"}
                icon={<Scale className="size-3" aria-hidden="true" />}
              />
              <Meta
                label="Files"
                value={latest ? formatNumber(latest.filesCount) : "—"}
                icon={<FolderOpen className="size-3" aria-hidden="true" />}
              />
              <Meta label="Author" value={detail.author || "Unknown"} />
              <Meta
                label="Stars"
                value={detail.stars > 0 ? formatNumber(detail.stars) : "0"}
                icon={<Sparkles className="size-3" aria-hidden="true" />}
              />
              <Meta label="Source" value={detail.sourceName} />
              <Meta label="Updated" value={formatRelative(detail.updatedAt)} />
              <div className="col-span-2 min-w-0 border-t border-line/60 pt-3">
                <dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-soft">Repository</dt>
                <dd className="mt-1 min-w-0 text-[11px]">
                  {detail.repositoryUrl ? (
                    <ExternalLink href={detail.repositoryUrl} className="text-[11px]">
                      {truncateMiddle(detail.repositoryUrl, 84)}
                    </ExternalLink>
                  ) : (
                    <span className="text-muted">No repository URL</span>
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <section className="grid gap-5 sm:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-text">Scan findings</h3>
                {latest ? (
                  <Badge tone={latest.findings.length > 0 ? "warn" : "ok"}>
                    {latest.findings.length > 0
                      ? `${latest.findings.length} ${latest.findings.length === 1 ? "finding" : "findings"}`
                      : "Clear"}
                  </Badge>
                ) : null}
              </div>
              {latest ? (
                <div className="space-y-2.5 rounded-xl border border-line bg-surface/40 p-3">
                  <Progress
                    value={latest.securityScore}
                    label="Security score"
                    showValue
                    tone={scoreTone}
                  />
                  {latest.findings.length === 0 ? (
                    <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted">
                      <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-ok" aria-hidden="true" />
                      No scan findings were reported for the latest version.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {latest.findings.map((finding, index) => (
                        <li key={`${finding.code}-${index}`} className="flex items-start gap-2">
                          <RiskBadge risk={finding.severity} className="mt-0.5 shrink-0" />
                          <span className="min-w-0">
                            <span className="block text-[11px] leading-relaxed text-muted">
                              {finding.message}
                            </span>
                            <span className="mt-0.5 block font-mono text-[11px] text-muted-soft">
                              {finding.code}
                              {finding.file ? ` · ${finding.file}` : ""}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <p className="rounded-xl border border-line bg-surface/40 p-3 text-[11px] text-muted">
                  No version has been scanned yet.
                </p>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-text">Agent compatibility</h3>
                <Badge tone="outline">Agent Skills</Badge>
              </div>
              <div className="rounded-xl border border-line bg-surface/40 p-3">
                {detail.hosts.length === 0 ? (
                  <p className="text-[11px] leading-relaxed text-muted">
                    Host compatibility has not been scanned for this skill.
                  </p>
                ) : (
                  <ul className="grid grid-cols-2 gap-x-3 gap-y-2">
                    {detail.hosts.map((host) => (
                      <li key={host.host} className="flex min-w-0 items-center gap-2" title={host.notes}>
                        <span
                          className={cx(
                            "size-1.5 shrink-0 rounded-full",
                            host.status === "SUPPORTED" ? "bg-brand-soft" : host.status === "UNSUPPORTED" ? "bg-line" : "bg-cyan",
                          )}
                          aria-hidden="true"
                        />
                        <span className="truncate text-[11px] text-muted">{hostName(host.host)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-text">README</h3>
              <Badge tone="neutral">
                <ShieldCheck className="size-2.5" aria-hidden="true" />
                Safe read-only
              </Badge>
            </div>
            <div className="rounded-xl border border-line bg-canvas/35 p-4">
              <SafeMarkdown source={detail.readme} />
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-text">Versions</h3>
              <span className="text-[11px] text-muted">{detail.versions.length}</span>
            </div>
            {detail.versions.length === 0 ? (
              <p className="rounded-xl border border-line bg-surface/40 p-3 text-[11px] text-muted">
                No versions have been imported.
              </p>
            ) : (
              <div className="max-h-52 divide-y divide-line/60 overflow-y-auto rounded-xl border border-line bg-surface/40">
                {detail.versions.map((version) => (
                  <div key={version.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                    <span className="font-mono text-[11px] text-text">
                      {version.versionLabel || version.id.slice(0, 8)}
                    </span>
                    <Badge tone="neutral">
                      {formatNumber(version.filesCount)} {version.filesCount === 1 ? "file" : "files"}
                    </Badge>
                    <RiskBadge risk={version.riskLevel} />
                    {version.status === "QUARANTINED" ? <Badge tone="danger">Quarantined</Badge> : null}
                    {version.id === latest?.id ? <Badge tone="brand">Latest</Badge> : null}
                    <span className="ml-auto text-[11px] text-muted-soft">
                      {formatDate(version.publishedAt ?? version.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {activeInstallations.length > 0 ? (
            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-text">Local installations</h3>
                <Button variant="ghost" size="sm" onClick={() => navigate("library")}>
                  Open Library
                </Button>
              </div>
              <div className="divide-y divide-line/60 rounded-xl border border-line bg-surface/40">
                {activeInstallations.map((installation) => (
                  <div key={installation.id} className="flex items-start gap-3 px-3 py-2.5">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-ok" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-[11px] text-text">
                        {hostName(installation.host)}
                        <Badge tone={installation.status === "INSTALLED" ? "ok" : "warn"}>
                          {installation.status}
                        </Badge>
                        <span className="font-mono text-[11px] text-muted">
                          {installation.versionLabel ?? "unknown version"}
                        </span>
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-muted-soft" title={installation.installPath}>
                        {truncateMiddle(installation.installPath, 82)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="flex items-start gap-2 rounded-lg border border-line/70 bg-surface/30 px-3 py-2.5 text-[11px] leading-relaxed text-muted-soft">
            <ExternalLinkIcon className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
            Links in this README are shown as plain text. Use the provenance link above to open the
            source in your browser.
          </section>
        </div>
      ) : null}
    </Sheet>
  );
}

function Meta({
  label,
  value,
  mono = false,
  icon,
}: {
  label: string;
  value: string;
  mono?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-soft">
        {icon}
        {label}
      </dt>
      <dd className={cx("mt-1 truncate text-[11px] text-text", mono && "font-mono text-[11px]")} title={value}>
        {value}
      </dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="flex gap-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-14" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-2.5 w-full" />
        <Skeleton className="h-2.5 w-11/12" />
        <Skeleton className="h-2.5 w-2/3" />
      </div>
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="space-y-1.5">
            <Skeleton className="h-2 w-16" />
            <Skeleton className="h-2.5 w-24" />
          </div>
        ))}
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-56 w-full rounded-xl" />
    </div>
  );
}

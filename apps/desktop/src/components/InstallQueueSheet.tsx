import { useCallback, useEffect, useState } from "react";
import { CircleAlert, Download, ListPlus, X } from "lucide-react";
import { useAppData } from "../app/app-context";
import { useInstallQueue } from "../app/install-queue";
import { installQueuedSkills } from "../lib/install-queue";
import { Button } from "./ui/Button";
import { EmptyState } from "./ui/EmptyState";
import { IconButton } from "./ui/IconButton";
import { Sheet } from "./ui/Dialog";
import { Skeleton } from "./ui/Skeleton";
import { useToast } from "./ui/Toast";
import { hostName } from "../lib/constants";
import { errorMessage, pluralize } from "../lib/format";
import { ipc } from "../lib/ipc";
import { navigate } from "../lib/router";
import type { DetectedAgent } from "../lib/types";

export function InstallQueueSheet() {
  const { items, open, setOpen, remove, clear } = useInstallQueue();
  const { refresh } = useAppData();
  const toast = useToast();
  const [agents, setAgents] = useState<DetectedAgent[]>([]);
  const [hosts, setHosts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await ipc.detectAgents();
      setAgents(result);
      setHosts((current) => {
        const stillValid = current.filter((host) =>
          result.some(
            (agent) => agent.host === host && agent.detected && agent.supportsAgentSkills,
          ),
        );
        if (stillValid.length > 0) return stillValid;
        const first = result.find((agent) => agent.detected && agent.supportsAgentSkills);
        return first ? [first.host] : [];
      });
    } catch (reason) {
      setAgents([]);
      setError(errorMessage(reason, "Agent detection is unavailable."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void loadAgents();
  }, [open, loadAgents]);

  const installable = agents.filter((agent) => agent.detected && agent.supportsAgentSkills);
  const canInstall = items.length > 0 && hosts.length > 0 && !installing && !loading;

  const toggleHost = (host: string, checked: boolean) => {
    setHosts((current) =>
      checked ? [...new Set([...current, host])] : current.filter((item) => item !== host),
    );
  };

  const installAll = async () => {
    if (!canInstall) return;
    setInstalling(true);
    try {
      const { completed, failures } = await installQueuedSkills({
        items,
        hosts,
        install: ipc.installSkill,
        hostName,
      });

      if (completed.length > 0) {
        completed.forEach(remove);
        toast.success(
          `Installed ${pluralize(completed.length, "skill")}`,
          `On ${hosts.map(hostName).join(", ")}.`,
        );
        await refresh();
      }
      if (failures.length > 0) {
        toast.error(
          `Could not install ${pluralize(failures.length, "skill")}`,
          failures.join(" · "),
        );
      } else if (completed.length === items.length) {
        setOpen(false);
      }
    } finally {
      setInstalling(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Install queue"
      description={
        items.length > 0
          ? `${pluralize(items.length, "skill")} ready. They install together and keep their own versions.`
          : "Collect skills while you browse, then install them in one pass."
      }
      footer={
        items.length > 0 ? (
          <>
            <Button variant="ghost" onClick={clear} disabled={installing}>
              Clear queue
            </Button>
            <Button
              variant="primary"
              onClick={() => void installAll()}
              loading={installing}
              disabled={!canInstall}
            >
              <Download className="size-3.5" aria-hidden="true" />
              Install all ({items.length})
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Close
          </Button>
        )
      }
    >
      {items.length === 0 ? (
        <EmptyState
          icon={ListPlus}
          title="Your install queue is empty"
          description="Add skills from Explore to install them on your agents together, without opening one install panel at a time."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setOpen(false);
                navigate("explore");
              }}
            >
              Browse skills
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          <section>
            <h3 className="text-xs font-semibold text-text">Queued skills</h3>
            <ul className="mt-2 space-y-1.5">
              {items.map((item) => (
                <li
                  key={item.skillId}
                  className="flex items-center gap-2 rounded-lg border border-line bg-surface/45 px-3 py-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium text-text">
                      {item.name}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] text-muted">
                      {item.versionLabel}
                      {item.allowRisky ? " · high-risk allowed" : ""}
                    </span>
                  </span>
                  <IconButton
                    label={`Remove ${item.name} from the install queue`}
                    icon={<X className="size-3.5" aria-hidden="true" />}
                    size="sm"
                    disabled={installing}
                    onClick={() => remove(item.skillId)}
                  />
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-line bg-surface/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold text-text">Install targets</h3>
                <p className="mt-0.5 text-[11px] text-muted">
                  Every queued skill installs into the selected agents.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void loadAgents()}
                loading={loading}
              >
                Rescan
              </Button>
            </div>

            {loading ? (
              <div className="mt-3 space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-4/5" />
              </div>
            ) : error ? (
              <div className="mt-3 rounded-lg border border-danger/25 bg-danger/[0.06] px-3 py-2.5">
                <p className="flex items-start gap-2 text-[11px] leading-relaxed text-danger">
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  {error}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  onClick={() => void loadAgents()}
                >
                  Retry detection
                </Button>
              </div>
            ) : installable.length === 0 ? (
              <p className="mt-3 rounded-lg border border-line bg-canvas/35 px-3 py-2.5 text-[11px] leading-relaxed text-muted">
                No supported agent runtime was detected. Use My Agents to rescan after installing an
                agent.
              </p>
            ) : (
              <div className="mt-3 space-y-1.5">
                {installable.map((agent) => {
                  const checked = hosts.includes(agent.host);
                  return (
                    <label
                      key={agent.host}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-canvas/25 px-3 py-2 transition-colors hover:border-brand/25"
                    >
                      <input
                        type="checkbox"
                        className="size-3.5 accent-[#2f6bff]"
                        checked={checked}
                        onChange={(event) => toggleHost(agent.host, event.target.checked)}
                      />
                      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-text">
                        {agent.name || hostName(agent.host)}
                      </span>
                      {agent.version ? (
                        <span className="shrink-0 font-mono text-[11px] text-muted">
                          {agent.version}
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </Sheet>
  );
}

import {
  ArrowDownToLine,
  ArrowUpCircle,
  Bot,
  Compass,
  FolderGit2,
  House,
  LayoutGrid,
  Library,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { APP_VERSION } from "../../lib/constants";
import { cx } from "../../lib/cx";
import { navigate, type Route } from "../../lib/router";
import { useAppData } from "../../app/app-context";
import { Tooltip } from "../ui/Tooltip";

interface NavItem {
  route: Route;
  label: string;
  icon: LucideIcon;
}

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Discover",
    items: [
      { route: "home", label: "Home", icon: House },
      { route: "explore", label: "Explore", icon: Compass },
      { route: "categories", label: "Categories", icon: LayoutGrid },
    ],
  },
  {
    label: "Manage",
    items: [
      { route: "library", label: "Library", icon: Library },
      { route: "updates", label: "Updates", icon: ArrowUpCircle },
      { route: "agents", label: "My Agents", icon: Bot },
    ],
  },
  {
    label: "System",
    items: [
      { route: "sources", label: "Sources", icon: FolderGit2 },
      { route: "activity", label: "Downloads", icon: ArrowDownToLine },
      { route: "settings", label: "Settings", icon: Settings },
    ],
  },
];

export interface SidebarProps {
  route: Route;
}

export function Sidebar({ route }: SidebarProps) {
  const { bootstrap } = useAppData();
  const stats = bootstrap?.stats;

  return (
    <aside className="relative z-30 flex h-full w-[72px] shrink-0 flex-col border-r border-line bg-surface/55 lg:w-[236px]">
      <div className="flex h-16 shrink-0 items-center justify-center gap-2.5 border-b border-line/70 px-3 lg:justify-start lg:px-4">
        <button
          type="button"
          onClick={() => navigate("home")}
          className="group flex min-w-0 items-center gap-2.5 rounded-lg text-left"
          aria-label="Skills Launcher home"
        >
          <img
            src="/logo.png"
            alt=""
            className="size-9 shrink-0 rounded-[10px] shadow-[0_0_26px_-8px_rgba(47,107,255,0.6)] ring-1 ring-white/10"
          />
          <span className="hidden min-w-0 lg:block">
            <span className="block truncate text-[13px] font-semibold tracking-[-0.015em] text-text">
              Skills Launcher
            </span>
            <span className="mt-0.5 block text-[11px] font-medium uppercase tracking-[0.16em] text-muted-soft">
              Local catalog
            </span>
          </span>
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-visible px-2.5 py-4 lg:overflow-y-auto" aria-label="Primary">
        <div className="space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 hidden px-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-soft lg:block">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = item.route === route;
                  const Icon = item.icon;
                  const badge =
                    item.route === "updates" && stats?.updates ? stats.updates : undefined;
                  return (
                    <Tooltip
                      key={item.route}
                      label={item.label}
                      side="right"
                      hideOnLarge
                      className="w-full"
                    >
                      <button
                        type="button"
                        onClick={() => navigate(item.route)}
                        aria-current={active ? "page" : undefined}
                        aria-label={item.label}
                        className={cx(
                          "group/item relative flex h-9 w-full items-center justify-center gap-2.5 rounded-lg px-2.5 text-xs font-medium transition-colors duration-200 ease-[var(--ease-out)] lg:justify-start",
                          active
                            ? "bg-elevated/75 text-text"
                            : "text-muted hover:bg-text/[0.045] hover:text-text",
                        )}
                      >
                        {active ? (
                          <span
                            className="absolute left-0 top-1/2 h-3.5 w-[2px] -translate-y-1/2 rounded-full bg-brand shadow-[0_0_8px_rgba(47,107,255,0.8)]"
                            aria-hidden="true"
                          />
                        ) : null}
                        <Icon
                          className={cx(
                            "size-4 shrink-0 transition-colors",
                            active ? "text-brand-soft" : "text-muted-soft group-hover/item:text-text",
                          )}
                          aria-hidden="true"
                        />
                        <span className="hidden lg:inline">{item.label}</span>
                        {badge ? (
                          <span className="ml-auto hidden rounded bg-brand/15 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-brand-soft lg:inline">
                            {badge}
                          </span>
                        ) : null}
                      </button>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="shrink-0 px-2.5 py-3 lg:px-3">
        <p className="text-center text-[11px] tracking-[0.08em] text-muted-soft">
          v{APP_VERSION}
        </p>
      </div>
    </aside>
  );
}

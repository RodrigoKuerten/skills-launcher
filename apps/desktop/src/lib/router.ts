export const ROUTES = [
  "home",
  "explore",
  "categories",
  "library",
  "updates",
  "agents",
  "sources",
  "activity",
  "settings",
] as const;

export type Route = (typeof ROUTES)[number];

export interface RouteState {
  route: Route;
  params: URLSearchParams;
}

export interface RouteMeta {
  title: string;
  eyebrow: string;
  description: string;
}

export const ROUTE_META: Record<Route, RouteMeta> = {
  home: {
    title: "Overview",
    eyebrow: "Workspace",
    description: "A local-first view of your sources, skills and agents.",
  },
  explore: {
    title: "Explore",
    eyebrow: "Catalog",
    description: "Search every skill imported from your sources.",
  },
  categories: {
    title: "Categories",
    eyebrow: "Catalog",
    description: "Browse the catalog by the work you want to do.",
  },
  library: {
    title: "Library",
    eyebrow: "Manage",
    description: "Installed skills, their hosts and their local state.",
  },
  updates: {
    title: "Updates",
    eyebrow: "Manage",
    description: "Review upstream changes before they reach an agent.",
  },
  agents: {
    title: "My Agents",
    eyebrow: "Manage",
    description: "Detected runtimes and the skill folders they own.",
  },
  sources: {
    title: "Sources",
    eyebrow: "System",
    description: "The repositories, folders and catalogs feeding your library.",
  },
  activity: {
    title: "Activity",
    eyebrow: "System",
    description: "A local journal of syncs, installs and settings changes.",
  },
  settings: {
    title: "Settings",
    eyebrow: "System",
    description: "Catalog behavior, session credentials and appearance.",
  },
};

function isRoute(value: string): value is Route {
  return (ROUTES as readonly string[]).includes(value);
}

export function buildHash(
  route: Route,
  params?: Record<string, string | number | boolean | null | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    search.set(key, value === true ? "1" : String(value));
  }
  const suffix = search.toString();
  return `#/${route}${suffix ? `?${suffix}` : ""}`;
}

export function navigate(
  route: Route,
  params?: Record<string, string | number | boolean | null | undefined>,
): void {
  const hash = buildHash(route, params);
  if (window.location.hash === hash) return;
  window.location.hash = hash;
}

export function parseLocation(hash = window.location.hash): RouteState {
  const raw = hash.replace(/^#\/?/, "");
  const [path = "", query = ""] = raw.split("?");
  const route = isRoute(path) ? path : "home";
  return { route, params: new URLSearchParams(query) };
}

import { useCallback, useEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { APP_NAME } from "../lib/constants";
import { buildHash, navigate, parseLocation, ROUTE_META, type RouteState } from "../lib/router";
import { AppDataProvider, useAppData } from "./app-context";
import { Sidebar } from "../components/layout/Sidebar";
import { Topbar } from "../components/layout/Topbar";
import { Button } from "../components/ui/Button";
import { ToastProvider } from "../components/ui/Toast";
import HomePage from "../pages/HomePage";
import ExplorePage from "../pages/ExplorePage";
import CategoriesPage from "../pages/CategoriesPage";
import LibraryPage from "../pages/LibraryPage";
import UpdatesPage from "../pages/UpdatesPage";
import AgentsPage from "../pages/AgentsPage";
import SourcesPage from "../pages/SourcesPage";
import ActivityPage from "../pages/ActivityPage";
import SettingsPage from "../pages/SettingsPage";

export default function App() {
  return (
    <ToastProvider>
      <AppDataProvider>
        <AppShell />
      </AppDataProvider>
    </ToastProvider>
  );
}

function AppShell() {
  const { bootstrap, loading, error, refresh } = useAppData();
  const [location, setLocation] = useState<RouteState>(() => parseLocation());
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onHashChange = () => setLocation(parseLocation());
    window.addEventListener("hashchange", onHashChange);
    if (!window.location.hash) {
      window.history.replaceState(null, "", buildHash("home"));
    }
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    document.title = `${ROUTE_META[location.route].title} · ${APP_NAME}`;
    mainRef.current?.scrollTo({ top: 0 });
  }, [location]);

  const focusExploreSearch = useCallback(() => {
    if (location.route !== "explore") {
      navigate("explore");
      window.setTimeout(() => {
        document.getElementById("explore-search")?.focus();
      }, 120);
      return;
    }
    document.getElementById("explore-search")?.focus();
  }, [location.route]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        focusExploreSearch();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusExploreSearch]);

  if (loading) return <Splash />;

  if (!bootstrap) {
    return <FatalState message={error ?? "The local catalog did not return any data."} />;
  }

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <Sidebar route={location.route} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar route={location.route} onFocusSearch={focusExploreSearch} />
        <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto" id="main-content">
          {error ? (
            <div className="flex flex-wrap items-center gap-3 border-b border-warn/20 bg-warn/[0.055] px-4 py-2 text-[11px] text-warn sm:px-6 xl:px-7">
              <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">{error}</span>
              <Button size="sm" variant="ghost" onClick={() => void refresh()} className="h-7">
                Retry
              </Button>
            </div>
          ) : null}
          <div
            key={location.route}
            className="mx-auto w-full max-w-[1240px] animate-page-in px-4 py-6 sm:px-6 xl:px-7"
          >
            <PageForRoute location={location} />
          </div>
        </main>
      </div>
    </div>
  );
}

function PageForRoute({ location }: { location: RouteState }) {
  switch (location.route) {
    case "home":
      return <HomePage />;
    case "explore":
      return <ExplorePage params={location.params} />;
    case "categories":
      return <CategoriesPage />;
    case "library":
      return <LibraryPage />;
    case "updates":
      return <UpdatesPage />;
    case "agents":
      return <AgentsPage />;
    case "sources":
      return <SourcesPage />;
    case "activity":
      return <ActivityPage />;
    case "settings":
      return <SettingsPage />;
    default:
      return <HomePage />;
  }
}

function Splash() {
  return (
    <div className="relative grid h-full place-items-center overflow-hidden px-6" aria-busy="true">
      <div className="hero-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative flex max-w-sm flex-col items-center text-center">
        <div className="relative">
          <div className="absolute inset-0 rounded-3xl bg-brand/30 blur-2xl" aria-hidden="true" />
          <img
            src="/logo.png"
            alt=""
            className="relative size-16 rounded-2xl shadow-[0_0_44px_rgba(47,107,255,0.28)] ring-1 ring-white/10"
          />
        </div>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-soft/80">
          Skills Launcher
        </p>
        <h1 className="mt-2 text-lg font-semibold tracking-[-0.025em] text-text">
          Opening your local catalog
        </h1>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Reading sources, installations and the last operation journal.
        </p>
        <div className="mt-6 h-1 w-44 overflow-hidden rounded-full bg-line/70" aria-hidden="true">
          <div className="animate-soft-pulse h-full w-2/3 rounded-full bg-brand" />
        </div>
      </div>
    </div>
  );
}

function FatalState({ message }: { message: string }) {
  return (
    <div className="relative grid h-full place-items-center overflow-hidden px-6">
      <div className="hero-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative w-full max-w-md rounded-[16px] border border-line bg-panel/80 p-6 text-center shadow-2xl">
        <img
          src="/logo.png"
          alt="Skills Launcher"
          className="mx-auto size-12 rounded-xl ring-1 ring-white/10"
        />
        <h1 className="mt-4 text-base font-semibold tracking-[-0.02em] text-text">
          The local catalog could not open
        </h1>
        <p className="mt-2 break-words text-xs leading-relaxed text-muted">{message}</p>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-soft">
          Skills Launcher reads its catalog through the Rust backend. If you are viewing the UI in a
          browser, start the desktop shell instead.
        </p>
        <Button
          variant="primary"
          className="mt-5"
          onClick={() => window.location.reload()}
        >
          Try again
        </Button>
      </div>
    </div>
  );
}

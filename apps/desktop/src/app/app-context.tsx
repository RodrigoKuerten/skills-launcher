import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { errorMessage } from "../lib/format";
import { ipc, onCatalogUpdated } from "../lib/ipc";
import type { Bootstrap } from "../lib/types";

interface AppDataContextValue {
  bootstrap: Bootstrap | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  revision: number;
  refresh: () => Promise<void>;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await ipc.getBootstrap();
      setBootstrap(data);
      setError(null);
      setRevision((current) => current + 1);
    } catch (reason) {
      setError(errorMessage(reason, "Could not read the local catalog."));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void ipc
      .getBootstrap()
      .then((data) => {
        if (!active) return;
        setBootstrap(data);
        setError(null);
        setRevision((current) => current + 1);
      })
      .catch((reason: unknown) => {
        if (active) setError(errorMessage(reason, "Could not open the local catalog."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    void onCatalogUpdated(() => {
      void refresh();
    })
      .then((stop) => {
        if (active) unlisten = stop;
        else stop();
      })
      .catch(() => {
        // The event bridge is optional in a plain browser preview.
      });
    return () => {
      active = false;
      unlisten?.();
    };
  }, [refresh]);

  useEffect(() => {
    const theme = bootstrap?.settings.theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [bootstrap?.settings.theme]);

  return (
    <AppDataContext.Provider value={{ bootstrap, loading, refreshing, error, revision, refresh }}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData(): AppDataContextValue {
  const value = useContext(AppDataContext);
  if (!value) throw new Error("useAppData must be used inside AppDataProvider");
  return value;
}

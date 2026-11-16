import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { InstallQueueItem } from "../lib/install-queue";

interface InstallQueueValue {
  items: InstallQueueItem[];
  open: boolean;
  setOpen: (open: boolean) => void;
  add: (item: InstallQueueItem) => void;
  remove: (skillId: string) => void;
  clear: () => void;
}

const InstallQueueContext = createContext<InstallQueueValue | null>(null);

export function InstallQueueProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<InstallQueueItem[]>([]);
  const [open, setOpen] = useState(false);

  const add = useCallback((item: InstallQueueItem) => {
    setItems((current) =>
      current.some((entry) => entry.skillId === item.skillId) ? current : [...current, item],
    );
  }, []);

  const remove = useCallback((skillId: string) => {
    setItems((current) => current.filter((entry) => entry.skillId !== skillId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(
    () => ({ items, open, setOpen, add, remove, clear }),
    [items, open, add, remove, clear],
  );

  return <InstallQueueContext.Provider value={value}>{children}</InstallQueueContext.Provider>;
}

export function useInstallQueue(): InstallQueueValue {
  const value = useContext(InstallQueueContext);
  if (!value) throw new Error("useInstallQueue must be used inside InstallQueueProvider");
  return value;
}

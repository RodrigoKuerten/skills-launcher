import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Boxes, ShieldCheck, GitBranch, ArrowUpCircle } from "lucide-react";

type Stats = {
  sources: number;
  skills: number;
  installed: number;
  updates: number;
  blockedSkills: number;
};

export default function App() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<{ stats: Stats }>("get_bootstrap")
      .then((data) => setStats(data.stats))
      .catch((reason: unknown) => setError(String(reason)));
  }, []);

  return (
    <main className="flex h-full flex-col items-center justify-center gap-8 p-10">
      <div className="flex flex-col items-center gap-4 text-center">
        <img
          src="/logo.png"
          alt="Skills Launcher"
          className="size-16 rounded-2xl shadow-[0_0_44px_rgba(47,107,255,0.28)] ring-1 ring-white/10"
        />
        <h1 className="text-2xl font-semibold tracking-tight">Skills Launcher</h1>
        <p className="max-w-md text-sm text-muted">
          One library for every AI agent. The Rust backend and local catalog are wired up.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>
      ) : stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat icon={GitBranch} label="Sources" value={stats.sources} />
          <Stat icon={Boxes} label="Skills" value={stats.skills} />
          <Stat icon={ShieldCheck} label="Installed" value={stats.installed} />
          <Stat icon={ArrowUpCircle} label="Updates" value={stats.updates} />
        </div>
      ) : (
        <p className="text-sm text-muted">Opening local catalog…</p>
      )}
    </main>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Boxes;
  label: string;
  value: number;
}) {
  return (
    <div className="min-w-32 rounded-xl border border-line bg-surface/80 p-4">
      <Icon className="mb-3 size-4 text-brand-soft" />
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

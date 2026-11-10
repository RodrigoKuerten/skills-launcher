import { dirname } from "node:path";
import { fetchManifest, findUpdates, installManifest } from "./installer.js";
import { appendJournal, readState } from "./store.js";
import { marketplaceToken, reportInstallation } from "./report.js";

export interface AutoUpdateSummary {
  checked: number;
  updated: number;
  failed: number;
  skipped: boolean;
  errors: Array<{ slug: string; host: string; message: string }>;
}

let timer: NodeJS.Timeout | null = null;

export function autoUpdateIntervalMs(): number {
  const raw = Number(process.env.AUTO_UPDATE_INTERVAL_MS ?? 6 * 60 * 60 * 1000);
  return Number.isFinite(raw) ? Math.max(60_000, raw) : 6 * 60 * 60 * 1000;
}

/**
 * Runs an update pass only when the user explicitly enabled background updates.
 * Every install still goes through checksum/path verification and backups.
 */
export async function runAutoUpdate(appUrl: string): Promise<AutoUpdateSummary> {
  const state = await readState();
  const summary: AutoUpdateSummary = { checked: 0, updated: 0, failed: 0, skipped: false, errors: [] };
  if (!state.autoUpdate) {
    summary.skipped = true;
    return summary;
  }

  const result = await findUpdates(appUrl);
  summary.checked = result.updates.length;
  for (const error of result.errors) {
    summary.failed += 1;
    summary.errors.push({ slug: error.slug, host: "", message: error.message });
  }

  for (const update of result.updates) {
    try {
      const manifest = await fetchManifest(appUrl, update.slug);
      const installed = await installManifest(manifest, {
        host: update.host,
        rootOverride: dirname(update.installPath),
        expectedSlug: update.slug,
      });
      summary.updated += 1;
      const token = marketplaceToken();
      if (token) {
        const report = await reportInstallation(installed.installed, "INSTALLED", appUrl, token);
        if (!report.reported) {
          await appendJournal({
            op: "AUTO_UPDATE_REPORT",
            slug: update.slug,
            host: update.host,
            ok: false,
            error: report.message,
          });
        }
      }
      await appendJournal({
        op: "AUTO_UPDATE",
        slug: update.slug,
        host: update.host,
        from: update.currentVersion,
        to: installed.installed.versionLabel,
        status: "ok",
      });
    } catch (error) {
      summary.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      summary.errors.push({ slug: update.slug, host: update.host, message });
      await appendJournal({ op: "AUTO_UPDATE", slug: update.slug, host: update.host, status: "error", error: message });
    }
  }
  return summary;
}

/** Replace the background timer to match the persisted setting. */
export function configureAutoUpdate(enabled: boolean, appUrl: string): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (!enabled) return;
  timer = setInterval(() => {
    void runAutoUpdate(appUrl).catch((error) => {
      void appendJournal({
        op: "AUTO_UPDATE",
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, autoUpdateIntervalMs());
  timer.unref?.();
}

export function stopAutoUpdate(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

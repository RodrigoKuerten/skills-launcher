import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { errorMessage, isHttpsUrl } from "./format";
import type {
  Backup,
  Bootstrap,
  Category,
  DetectedAgent,
  InstallRequest,
  InstallResponse,
  InstalledScanResult,
  Installation,
  Operation,
  Settings,
  SettingsInput,
  SkillDetail,
  SkillPage,
  SkillQuery,
  Source,
  SourceExport,
  SourceInput,
  SourceRun,
  Stats,
  SyncSummary,
  UpdateItem,
} from "./types";

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (reason) {
    throw new Error(errorMessage(reason, `The ${command.replace(/_/g, " ")} command failed.`));
  }
}

export const ipc = {
  getBootstrap: () => call<Bootstrap>("get_bootstrap"),
  getStats: () => call<Stats>("get_stats"),
  listCategories: () => call<Category[]>("list_categories"),
  listSources: () => call<Source[]>("list_sources"),
  getSettings: () => call<Settings>("get_settings"),
  updateSettings: (input: SettingsInput) => call<Settings>("update_settings", { input }),

  listSkills: (query: SkillQuery) => call<SkillPage>("list_skills", { query }),
  getSkill: (id: string) => call<SkillDetail>("get_skill", { id }),
  listInstallations: () => call<Installation[]>("list_installations"),
  listUpdates: () => call<UpdateItem[]>("list_updates"),

  addSource: (input: SourceInput) => call<Source>("add_source", { input }),
  updateSource: (id: string, input: SourceInput) => call<Source>("update_source", { id, input }),
  setSourceEnabled: (id: string, enabled: boolean) =>
    call<Source>("set_source_enabled", { id, enabled }),
  deleteSource: (id: string) => call<void>("delete_source", { id }),
  syncSource: (sourceId: string) => call<SyncSummary>("sync_source", { sourceId }),
  syncAllSources: () => call<SyncSummary[]>("sync_all_sources"),
  listSourceRuns: (sourceId?: string, limit?: number) =>
    call<SourceRun[]>("list_source_runs", { sourceId: sourceId ?? null, limit: limit ?? null }),
  exportSources: () => call<SourceExport>("export_sources"),
  importSources: (json: string) => call<Source[]>("import_sources", { json }),
  pickSourcePath: (kind: "dir" | "zip") =>
    call<string | null>("pick_source_path", { kind }),

  detectAgents: () => call<DetectedAgent[]>("detect_agents"),
  scanInstalledSkills: () => call<InstalledScanResult>("scan_installed_skills"),
  setAgentAutoInstall: (host: string, enabled: boolean) =>
    call<DetectedAgent[]>("set_agent_auto_install", { host, enabled }),
  setManualAgent: (host: string, executablePath?: string | null, skillsPath?: string | null) =>
    call<DetectedAgent[]>("set_manual_agent", {
      host,
      executablePath: executablePath ?? null,
      skillsPath: skillsPath ?? null,
    }),
  clearManualAgent: (host: string) =>
    call<DetectedAgent[]>("clear_manual_agent", { host }),
  installSkill: (request: InstallRequest) =>
    call<InstallResponse>("install_skill", { request }),
  updateInstallation: (id: string) => call<InstallResponse>("update_installation", { id }),
  uninstallSkill: (id: string, removeFiles: boolean) =>
    call<void>("uninstall_skill", { id, removeFiles }),
  rollbackInstallation: (id: string, backupId?: string) =>
    call<InstallResponse>("rollback_installation", { id, backupId: backupId ?? null }),
  listBackups: (installationId?: string) =>
    call<Backup[]>("list_backups", { installationId: installationId ?? null }),
  listOperations: (limit?: number) => call<Operation[]>("list_operations", { limit: limit ?? null }),

  openUrl: async (url: string) => {
    if (!isHttpsUrl(url)) {
      throw new Error("Only HTTPS links without embedded credentials can be opened.");
    }
    return call<void>("open_url", { url });
  },
};

export function onCatalogUpdated(handler: (payload: SyncSummary | SyncSummary[]) => void): Promise<UnlistenFn> {
  return listen<SyncSummary | SyncSummary[]>("catalog-updated", (event) => handler(event.payload));
}

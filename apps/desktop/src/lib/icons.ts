import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Box,
  Clock3,
  Code2,
  Container,
  Database,
  FileArchive,
  FolderOpen,
  GitBranch,
  Globe,
  Layers,
  ListChecks,
  Palette,
  Search,
  Server,
  Shield,
  TestTube2,
  Zap,
} from "lucide-react";
import type { SourceKind } from "./types";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Code2,
  Server,
  Palette,
  Layers,
  Shield,
  Container,
  Zap,
  Bot,
  Database,
  TestTube2,
  Search,
  ListChecks,
  Box,
};

export function categoryIcon(name: string | null | undefined): LucideIcon {
  return (name && CATEGORY_ICONS[name]) || Box;
}

export function sourceKindIcon(kind: SourceKind): LucideIcon {
  switch (kind) {
    case "github_repo":
      return GitBranch;
    case "github_org":
      return Globe;
    case "local_dir":
      return FolderOpen;
    case "zip":
      return FileArchive;
    case "git_repo":
      return GitBranch;
    case "http_json":
      return Search;
    default:
      return Box;
  }
}

export function operationIcon(kind: string): LucideIcon {
  switch (kind) {
    case "install":
      return Box;
    case "update":
      return Layers;
    case "uninstall":
    case "remove":
      return FileArchive;
    case "rollback":
      return Clock3;
    case "sync":
      return Globe;
    default:
      return ListChecks;
  }
}

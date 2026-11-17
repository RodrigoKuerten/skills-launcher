export type DesktopPlatform = "windows" | "macos" | "linux" | "other";

export function desktopPlatform(): DesktopPlatform {
  if (typeof navigator === "undefined") return "other";
  const value = `${navigator.platform} ${navigator.userAgent}`.toLowerCase();
  if (value.includes("win")) return "windows";
  if (value.includes("mac")) return "macos";
  if (value.includes("linux")) return "linux";
  return "other";
}

export function platformHome(platform: DesktopPlatform): {
  label: string;
  home: string;
  example: string;
} {
  switch (platform) {
    case "windows":
      return {
        label: "Windows",
        home: "C:\\Users\\<you>",
        example: "C:\\Users\\<you>\\.claude\\skills",
      };
    case "macos":
      return {
        label: "macOS",
        home: "/Users/<you>",
        example: "/Users/<you>/.claude/skills",
      };
    case "linux":
      return {
        label: "Linux",
        home: "/home/<you>",
        example: "/home/<you>/.claude/skills",
      };
    default:
      return { label: "This system", home: "~", example: "~/.claude/skills" };
  }
}

export function executablePlaceholder(host: string, platform: DesktopPlatform): string {
  if (platform === "windows") {
    return host === "opencode"
      ? "C:\\Users\\you\\AppData\\Local\\...\\opencode.exe"
      : "C:\\path\\to\\agent.exe";
  }
  if (platform === "macos") {
    return host === "opencode"
      ? "/Applications/OpenCode.app/Contents/MacOS/OpenCode"
      : "/Applications/Agent.app/Contents/MacOS/Agent";
  }
  if (platform === "linux") {
    return host === "opencode" ? "/opt/OpenCode/ai.opencode" : "/usr/local/bin/agent";
  }
  return "Absolute path to the agent executable";
}

import { describe, expect, it } from "vitest";
import { executablePlaceholder, platformHome } from "../src/lib/platform";

describe("platform paths", () => {
  it("uses a Linux executable placeholder without a Windows drive", () => {
    const placeholder = executablePlaceholder("opencode", "linux");
    expect(placeholder).toBe("/opt/OpenCode/ai.opencode");
    expect(placeholder).not.toContain("C:");
  });

  it("keeps Windows and macOS examples platform-specific", () => {
    expect(executablePlaceholder("opencode", "windows")).toContain("C:\\");
    expect(executablePlaceholder("opencode", "macos")).toContain("/Applications/");
    expect(platformHome("linux").home).toBe("/home/<you>");
    expect(platformHome("windows").home).toBe("C:\\Users\\<you>");
  });
});

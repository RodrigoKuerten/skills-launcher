import type { Theme } from "./types";

let appliedTheme: Theme | null = null;

/** Applies the appearance with a short crossfade when the browser supports it. */
export function applyTheme(theme: Theme) {
  if (appliedTheme === theme) return;
  const update = () => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
    appliedTheme = theme;
  };
  const supportsTransition =
    appliedTheme !== null && typeof document.startViewTransition === "function";
  if (supportsTransition) {
    try {
      document.startViewTransition(update);
      return;
    } catch {
      // Fall through to an immediate update if the view transition cannot start.
    }
  }
  update();
}

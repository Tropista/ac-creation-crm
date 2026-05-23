export const THEME_KEY = "crm_theme";
export const THEMES = ["light", "dark", "system"];

export function getStoredTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  return THEMES.includes(stored) ? stored : "system";
}

export function resolveTheme(theme = getStoredTheme()) {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
}

export function applyTheme(theme = getStoredTheme()) {
  const resolved = resolveTheme(theme);
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.setAttribute("data-theme-preference", theme);
}

export function setTheme(theme) {
  if (!THEMES.includes(theme)) return;
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}

export function initTheme() {
  applyTheme(getStoredTheme());

  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (getStoredTheme() === "system") {
        applyTheme("system");
      }
    });
}

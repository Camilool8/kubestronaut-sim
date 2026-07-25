import { useCallback, useEffect, useState } from "react";

// Theme preference: one localStorage key shared with the Go locked page
// (facilitator/internal/desktop/proxy.go reads the same key inline).
// "system" sets no data-theme attribute — tokens.css falls back to
// prefers-color-scheme.
export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "sim.theme";

export function loadTheme(): ThemePreference {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === "light" || raw === "dark" ? raw : "system";
}

export function applyTheme(pref: ThemePreference): void {
  if (pref === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", pref);
  }
  localStorage.setItem(STORAGE_KEY, pref);
}

export function cycleTheme(pref: ThemePreference): ThemePreference {
  switch (pref) {
    case "system":
      return "light";
    case "light":
      return "dark";
    default:
      return "system";
  }
}

// useTheme owns the preference state and keeps the DOM attribute in
// sync; applyTheme is called on mount so a stored choice survives
// reloads (index.html carries no inline script — first paint may briefly
// use the system theme, acceptable for a local tool).
export function useTheme(): [ThemePreference, () => void] {
  const [pref, setPref] = useState<ThemePreference>(() => loadTheme());

  useEffect(() => {
    applyTheme(pref);
  }, [pref]);

  const cycle = useCallback(() => setPref((p) => cycleTheme(p)), []);
  return [pref, cycle];
}

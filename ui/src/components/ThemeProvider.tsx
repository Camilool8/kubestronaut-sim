import { useCallback, useEffect, useState } from "react";

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

export function useTheme(): [ThemePreference, () => void] {
  const [pref, setPref] = useState<ThemePreference>(() => loadTheme());

  useEffect(() => {
    applyTheme(pref);
  }, [pref]);

  const cycle = useCallback(() => setPref((p) => cycleTheme(p)), []);
  return [pref, cycle];
}

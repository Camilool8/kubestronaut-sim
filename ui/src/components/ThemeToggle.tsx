import { useTheme } from "./ThemeProvider";
import { Icon, type IconName } from "./Icon";
import { strings } from "../strings";

// An icon name is not user-facing copy, so it does not belong in
// strings.ts — it used to live there as the literals ◐ / ☀ / ☾, none of
// which exist in the bundled fonts, and ☀/☾ can render as colour emoji.
const THEME_ICONS: Record<string, IconName> = {
  system: "theme-auto",
  light: "theme-light",
  dark: "theme-dark",
};

// Tri-state theme control: System -> Light -> Dark. One small button —
// the label always names the CURRENT preference; activating advances to
// the next.
export function ThemeToggle() {
  const [pref, cycle] = useTheme();

  return (
    <button
      className="theme-toggle"
      onClick={cycle}
      aria-label={strings.theme.ariaLabel(strings.theme.labels[pref])}
    >
      <span aria-hidden="true"><Icon name={THEME_ICONS[pref]} /></span>{" "}
      {strings.theme.labels[pref]}
    </button>
  );
}

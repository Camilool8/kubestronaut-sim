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
      {/* Wrapped so the compact header can hide the WORD and keep the
          glyph. Safe to hide with CSS, unlike most labels: the button
          carries an explicit aria-label, which replaces its contents
          entirely for a screen reader — so there is no second name to
          collide with, and nothing is lost when the text goes. */}
      <span className="theme-toggle-label">{strings.theme.labels[pref]}</span>
    </button>
  );
}

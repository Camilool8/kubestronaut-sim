import { useTheme } from "./ThemeProvider";
import { strings } from "../strings";

// Tri-state theme control: System -> Light -> Dark. One small button —
// the label always names the CURRENT preference; activating advances to
// the next.
export function ThemeToggle({ floating = false }: { floating?: boolean }) {
  const [pref, cycle] = useTheme();

  return (
    <button
      className={`theme-toggle${floating ? " theme-toggle-floating" : ""}`}
      onClick={cycle}
      aria-label={strings.theme.ariaLabel(strings.theme.labels[pref])}
    >
      <span aria-hidden="true">{strings.theme.icons[pref]}</span>{" "}
      {strings.theme.labels[pref]}
    </button>
  );
}

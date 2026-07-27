import type { ReactNode } from "react";

// The product's icons, hand-authored and bundled.
//
// They used to be Unicode literals, and eight of them — every functional
// one — did not exist in the fonts this app ships. @fontsource declares a
// `unicode-range` on each @font-face, which is a hard gate: a codepoint
// outside every declared range never reaches the woff2 at all. ◆ ◇ ✓ ✗ ⧉
// ◐ ☀ ☾ are all outside both families' subsets, so they fell through to
// whatever the operating system had. ⧉ — the copy affordance, and the
// visual payload of what DESIGN.md calls the system's signature component
// — renders as a tofu box on many Linux font sets, and ☀/☾ can resolve to
// Apple Color Emoji on macOS, which DESIGN.md explicitly bans.
//
// The geometry is not invented here: ui/public/favicon.svg is already a
// hand-authored chevron with round caps and joins, no fill, and a stroke
// proportional to its 32 grid. This is that language at 24, which is the
// size the UI actually uses. Extending one system beats importing a
// second one, and it keeps the offline promise absolute — nothing about
// an icon can fail to arrive.
//
// The <svg> hardcodes aria-hidden and takes no label prop, deliberately.
// Every glyph in this product already sits beside .sr-only text or an
// aria-label on its own button, so by construction an icon here can never
// be the only carrier of meaning, and no later call site can make it one.

export type IconName =
  | "chevron-left"
  | "chevron-right"
  | "chevron-down"
  | "panel-collapse"
  | "panel-expand"
  | "check"
  | "cross"
  | "flag"
  | "flag-filled"
  | "copy"
  | "theme-auto"
  | "theme-light"
  | "theme-dark"
  | "help";

const SUN_RAYS = [
  "M12 2.4v2.2",
  "M12 19.4v2.2",
  "M2.4 12h2.2",
  "M19.4 12h2.2",
  "M5.2 5.2l1.6 1.6",
  "M17.2 17.2l1.6 1.6",
  "M18.8 5.2l-1.6 1.6",
  "M6.8 17.2l-1.6 1.6",
];

const PATHS: Record<IconName, ReactNode> = {
  "chevron-left": <path d="M14.5 7L9.5 12l5 5" />,
  "chevron-right": <path d="M9.5 7l5 5-5 5" />,
  "chevron-down": <path d="M7 9.5l5 5 5-5" />,
  // A bar the panel folds against, plus the direction it travels.
  "panel-collapse": (
    <>
      <path d="M4.5 4.5v15" />
      <path d="M16 8l-4 4 4 4" />
    </>
  ),
  "panel-expand": (
    <>
      <path d="M4.5 4.5v15" />
      <path d="M12 8l4 4-4 4" />
    </>
  ),
  check: <path d="M4.5 12.5l5 5 10-11" />,
  cross: (
    <>
      <path d="M6.5 6.5l11 11" />
      <path d="M17.5 6.5l-11 11" />
    </>
  ),
  flag: <path d="M6 21V4h12l-2.8 4.5L18 13H6" />,
  "flag-filled": (
    <>
      <path d="M6 21V4" />
      <path d="M6 4h12l-2.8 4.5L18 13H6z" fill="currentColor" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15.5A1.5 1.5 0 0 1 4 14V5.5A1.5 1.5 0 0 1 5.5 4H14a1.5 1.5 0 0 1 1.5 1.5" />
    </>
  ),
  // Half-lit disc: the same "auto" idea as the old ◐, drawn rather than
  // borrowed. The filled half is a real half-circle arc, so it reads at
  // 14px as well as at 44px.
  "theme-auto": (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" stroke="none" />
    </>
  ),
  "theme-light": (
    <>
      <circle cx="12" cy="12" r="4.2" />
      {SUN_RAYS.map((d) => (
        <path key={d} d={d} />
      ))}
    </>
  ),
  "theme-dark": <path d="M20 14.2A8.4 8.4 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2z" />,
  help: (
    <>
      <path d="M9.3 9.2a2.8 2.8 0 1 1 3.6 2.7c-.9.3-1.4 1-1.4 1.9v.5" />
      <path d="M11.5 17.6h.01" />
    </>
  ),
};

interface IconProps {
  name: IconName;
  /** Rides the type it sits in. Override only for a fixed-size control. */
  size?: string | number;
  className?: string;
}

export function Icon({ name, size = "1em", className }: IconProps) {
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

/** Test-only: the full name list, so a scan can assert every one renders. */
export const ICON_NAMES = Object.keys(PATHS) as IconName[];

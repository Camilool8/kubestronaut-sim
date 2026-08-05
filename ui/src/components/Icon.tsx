import type { ReactNode } from "react";

// The product's icons, hand-authored and bundled.
//
// They used to be Unicode literals, and eight of them — every functional
// one — did not exist in the fonts this app ships. @fontsource declares a
// `unicode-range` on each @font-face, which is a hard gate: a codepoint
// outside every declared range never reaches the woff2 at all. ◆ ◇ ✓ ✗ ⧉
// ◐ ☀ ☾ are all outside both families' subsets, so they fell through to
// whatever the operating system had. ⧉ — the copy affordance — renders as
// a tofu box on many Linux font sets, and ☀/☾ can resolve to Apple Color
// Emoji on macOS, which DESIGN.md explicitly bans.
//
// ⧉ no longer appears on the click-to-copy value itself. It sits on the
// two copy controls that have a real slot for it: the clipboard panel and
// the question pane's ssh hint. See `.copy-value` in theme.css for why
// the inline one has no icon at all.
//
// These are hand-authored on a 24 grid with round caps and joins, no
// fill, and a stroke proportional to the grid. Everything is drawn here
// rather than imported, which keeps the offline promise absolute —
// nothing about an icon can fail to arrive.
//
// Brand marks are deliberately NOT in this set — neither this product's
// (BrandMark.tsx, a filled multi-colour drawing on its own field, mirrored
// in ui/public/favicon.svg) nor anyone else's (the GitHub mark, drawn in
// HostedSignIn beside the button it belongs to). These are monochrome
// outlines on a 24 grid that take `currentColor`, and mixing a logo into
// them would invite a call site to restyle one.
//
// The <svg> hardcodes aria-hidden and takes no label prop, deliberately.
// Every glyph in this product already sits beside .sr-only text or an
// aria-label on its own button, so by construction an icon here can never
// be the only carrier of meaning, and no later call site can make it one.

export type IconName =
  | "chevron-left"
  | "chevron-right"
  | "chevron-down"
  | "check"
  | "cross"
  | "flag"
  | "flag-filled"
  | "copy"
  | "grid"
  | "keyboard"
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
  // The navigator trigger. The design draws this as ⊞, which is a boxed
  // plus and reads as "add" at 14px; four cells say "every task at once",
  // which is what the popover actually contains. Two rows of two rather
  // than the popover's real ten columns — at 14px a 10-wide grid is a
  // smear, and this is a signpost, not a diagram.
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  // Same 24 grid, same round caps: a key row and a space bar, which reads
  // as a keyboard at 14px without needing the individual keys drawn.
  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01" />
      <path d="M8 14h8" />
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
  className?: string;
}

// Always 1em: an icon rides the type it sits in, and no call site ever
// asked for anything else — the size prop that offered to was dead code
// pretending to be an API (#32). A fixed-size control sizes its type.
export function Icon({ name, className }: IconProps) {
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
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

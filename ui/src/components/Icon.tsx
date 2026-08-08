import type { ReactNode } from "react";

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
  | "help"
  | "menu"

  | "chart"
  | "user"
  | "exit"
  | "send"
  | "home"
  | "book";

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

  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),

  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01" />
      <path d="M8 14h8" />
    </>
  ),

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
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),

  chart: (
    <>
      <path d="M4 20h16" />
      <path d="M7.5 20v-5.5" />
      <path d="M12 20V8.5" />
      <path d="M16.5 20v-9" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.4" />
      <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
    </>
  ),

  exit: (
    <>
      <path d="M14.5 5.5h-7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h7" />
      <path d="M15 12h5.5" />
      <path d="M18 9l3 3-3 3" />
    </>
  ),

  send: (
    <>
      <path d="M18.5 11V6.5a2 2 0 0 0-2-2h-9a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H12" />
      <path d="M14.5 17.5l2 2 4-4.5" />
    </>
  ),
  home: (
    <>
      <path d="M4.5 10.8L12 4.8l7.5 6" />
      <path d="M6.5 10v9h11v-9" />
    </>
  ),
  book: (
    <>
      <path d="M5 4.8h5.5a2 2 0 0 1 2 2v12a1.6 1.6 0 0 0-1.6-1.6H5z" />
      <path d="M19 4.8h-4.5a2 2 0 0 0-2 2v12a1.6 1.6 0 0 1 1.6-1.6H19z" />
    </>
  ),
};

interface IconProps {
  name: IconName;
  className?: string;
}

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

export const ICON_NAMES = Object.keys(PATHS) as IconName[];

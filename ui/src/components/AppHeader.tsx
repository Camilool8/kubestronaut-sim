import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { InfoButton } from "./InfoButton";
import { ThemeToggle } from "./ThemeToggle";
import { navigate } from "../lib/useHashRoute";
import { strings } from "../strings";

// The product mark, at header scale.
//
// A mirror of ui/public/favicon.svg — same geometry, same three colours,
// scaled to the 26px the header draws it at. The colours are literal
// rather than var(): this is a filled multi-colour drawing, not a
// currentColor glyph, and it must read identically in both themes for
// the same reason the machine surfaces do. tokens.css names this file as
// one of the mark's mirrors.
function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="9" fill="#101728" />
      <circle cx="16" cy="16" r="8.3" fill="none" stroke="#6f9cf8" strokeWidth="1.6" />
      <circle cx="25.1" cy="6.9" r="3.2" fill="#8fd6a8" />
      <circle cx="6.9" cy="25.1" r="2.1" fill="#e8c46a" />
    </svg>
  );
}

/** One entry in the header's right-hand navigation. */
export interface NavItem {
  label: string;
  /** Route to navigate to, e.g. "/progress". */
  to: string;
  /** Renders as the current location rather than a link. */
  current?: boolean;
}

export interface AppHeaderProps {
  /**
   * "brand" leads with the product mark and wordmark: the top of the
   * app, where a candidate has not chosen anything yet.
   *
   * "back" replaces both with a labelled back link. It is for a screen
   * reached FROM another one, where re-stating the product name costs a
   * line and the way out is the useful thing.
   */
  variant?: "brand" | "back";
  /** "back" only: where the link goes, and what it is leaving to. */
  back?: { label: string; to: string };
  /**
   * The current location, in words. Sits after a divider on the brand
   * variant and is the heading of the back variant.
   */
  crumb?: string;
  /** An optional quieter second line beside the crumb. */
  detail?: string;
  nav?: NavItem[];
  /**
   * Anything that has to sit left of the theme toggle — today the
   * backgrounded-rebuild chip, which must be visible on every screen it
   * can reach or a 2-4 minute teardown happens behind an idle-looking
   * page.
   */
  children?: ReactNode;
}

/**
 * The chrome above every screen that is not the exam itself.
 *
 * One component with a variant rather than a header per screen: the two
 * layouts differ only in what leads the left cluster, and four
 * near-copies would have drifted the moment one of them gained a
 * control. The exam screens deliberately do NOT use this — their topbar
 * carries a clock and a submit button, which is a different component
 * with a different job, not a fifth variant of this one.
 */
export function AppHeader({
  variant = "brand",
  back,
  crumb,
  detail,
  nav,
  children,
}: AppHeaderProps) {
  return (
    <header className={`app-header app-header-${variant}`}>
      <div className="app-header-lead">
        {variant === "back" && back ? (
          <button
            type="button"
            className="app-header-back"
            onClick={() => navigate(back.to)}
          >
            {/* Icon, not a "←" literal: @fontsource declares a
                unicode-range per face and U+2190 is outside both of this
                app's, so the character would never reach the woff2 —
                exactly the trap Icon.tsx exists to close. */}
            <Icon name="chevron-left" /> {back.label}
          </button>
        ) : (
          <a className="app-header-home" href="#/">
            <BrandMark />
            <span className="app-header-wordmark">
              {strings.header.wordmark}
              <span className="app-header-wordmark-tail">{strings.header.wordmarkTail}</span>
            </span>
          </a>
        )}

        {crumb && (
          <>
            <span className="app-header-rule" aria-hidden="true" />
            <span className="app-header-crumb">{crumb}</span>
          </>
        )}
        {detail && <span className="app-header-detail">{detail}</span>}
      </div>

      <div className="app-header-tail">
        {children}
        {nav && nav.length > 0 && (
          <nav className="app-header-nav" aria-label={strings.header.navLabel}>
            {nav.map((item) =>
              item.current ? (
                <span key={item.to} className="app-header-link app-header-link-on" aria-current="page">
                  {item.label}
                </span>
              ) : (
                <button
                  key={item.to}
                  type="button"
                  className="app-header-link"
                  onClick={() => navigate(item.to)}
                >
                  {item.label}
                </button>
              ),
            )}
          </nav>
        )}
        <InfoButton />
        <ThemeToggle />
      </div>
    </header>
  );
}

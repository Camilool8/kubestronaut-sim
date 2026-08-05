import { useState } from "react";
import type { ReactNode } from "react";
import type { HostedSession } from "../api";
import { BrandMark } from "./BrandMark";
import { EndSessionDialog, SessionActions, SessionChip } from "./SessionChip";
import { Icon } from "./Icon";
import { InfoButton } from "./InfoButton";
import { ThemeToggle } from "./ThemeToggle";
import { navigate } from "../lib/useHashRoute";
import { strings } from "../strings";

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
   * Hosted only: the lease clock and the two ways out.
   *
   * A typed prop rather than more `children` because the header has to
   * know which of the things it carries collapse into the menu on a
   * narrow viewport and which stay in the bar — and because the
   * confirmation the End control raises has to be rendered here, outside
   * that menu, to survive it closing.
   */
  session?: { login: string; session?: HostedSession; onChanged: () => void };
  /**
   * Ambient status that never collapses — today the backgrounded-rebuild
   * chip, which must be visible on every screen it can reach or a 2-4
   * minute teardown happens behind an idle-looking page.
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
  session,
  children,
}: AppHeaderProps) {
  // Owned here, not by the control that raises it. See SessionChip.
  const [confirming, setConfirming] = useState(false);

  return (
    <>
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
          {session && (
            <div className="session-cluster">
              <SessionChip login={session.login} session={session.session} />
              <SessionActions session={session.session} onEnd={() => setConfirming(true)} />
            </div>
          )}
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
      {confirming && session && (
        <EndSessionDialog
          onClose={() => setConfirming(false)}
          onChanged={session.onChanged}
        />
      )}
    </>
  );
}

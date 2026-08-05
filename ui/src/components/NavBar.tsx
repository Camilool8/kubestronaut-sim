import { useState, type ReactNode } from "react";
import type { HostedSession } from "../api";
import { BrandMark } from "./BrandMark";
import { EndSessionDialog, SessionChip, signOut } from "./SessionChip";
import { InfoDrawer } from "./InfoDrawer";
import { NavMenu, NavMenuFact, NavMenuItem, NavMenuSection } from "./NavMenu";
import { useTheme } from "./ThemeProvider";
import { Icon, type IconName } from "./Icon";
import { navigate } from "../lib/useHashRoute";
import { HEADER_COMPACT_QUERY, useMediaQuery } from "../lib/useMediaQuery";
import { strings } from "../strings";

/** One destination. `current` renders it as where you are, not a link. */
export interface NavItem {
  label: string;
  to: string;
  icon: IconName;
  current?: boolean;
}

/**
 * One step of the path. The last entry is where you are and carries no
 * `to`; every earlier one is somewhere you can go back to.
 */
export interface Crumb {
  label: string;
  to?: string;
}

export interface NavBarProps {
  /**
   * The path from home to here, innermost last. The brand is always the
   * step before the first entry, so a trail never has to repeat it.
   */
  trail?: Crumb[];
  nav?: NavItem[];
  /** Hosted only: the lease clock, and the two ways out of a session. */
  session?: { login: string; session?: HostedSession; onChanged: () => void };
  /**
   * Ambient status that never collapses and never moves — the
   * backgrounded-rebuild chip today, the exam clock on the exam.
   *
   * It sits before the menu at every width, because the things that go
   * here are the things a candidate must be able to see without opening
   * anything.
   */
  children?: ReactNode;
  /**
   * Screen-specific menu rows, in their own section below navigation.
   * The exam's Submit is the only one today.
   */
  menuExtra?: ReactNode;
  /**
   * Whether the brand goes home.
   *
   * False during a running attempt: `session.state` is the outer switch,
   * so navigating home renders the exam again and the link would be a
   * control that does nothing. The mark still shows — it is identity
   * either way — it simply stops being a link.
   */
  home?: boolean;
}

/**
 * The navbar. One component, one anatomy, every screen in both products.
 *
 *   [ mark  wordmark ]  [ › trail ]  ……  [ status ]  [ menu ]
 *     always              contextual        ambient     always
 *
 * What this replaced had two layouts — a "brand" variant and a "back"
 * variant that REPLACED the mark and wordmark with a full-width labelled
 * button. So the product's identity disappeared on the mode and review
 * screens, the left of the bar became one large clickable thing, and the
 * menu came and went by route (it was rendered only when
 * `compact && (nav?.length || session)`, so the score screen had none at
 * all). Three different complaints with one cause: there was no single
 * arrangement, so nothing could be predicted from anywhere else.
 *
 * The rules now, and they hold everywhere:
 *
 *  - **The mark never leaves the left.** Going back is a trail beside it,
 *    not a replacement for it.
 *  - **The menu never leaves the right.** It is present on every screen
 *    at every width, and its sections are always in the same order.
 *  - **Width promotes, it does not rearrange.** A wide bar lifts the
 *    navigation section out of the menu and into the row. That is the
 *    only thing width changes.
 */
export function NavBar({ trail, nav, session, children, menuExtra, home = true }: NavBarProps) {
  const [confirming, setConfirming] = useState(false);
  const [about, setAbout] = useState(false);
  const [themePref, cycleTheme] = useTheme();
  // Branched in JS rather than hidden in CSS, and that is the whole
  // point: the controls MOVE. Rendering both copies and hiding one would
  // give every button two accessible names, which is a worse bug than
  // the overflow it fixes.
  const compact = useMediaQuery(HEADER_COMPACT_QUERY);

  const brand = (
    <>
      <BrandMark />
      <span className="navbar-wordmark">
        {strings.header.wordmark}
        <span className="navbar-wordmark-tail">{strings.header.wordmarkTail}</span>
      </span>
    </>
  );

  return (
    <>
      <header className="navbar">
        <div className="navbar-lead">
          {/* Home is a link, not a button: it is a location, it belongs
              in the browser's own history, and it should middle-click
              like every other link in the app. */}
          {home ? (
            <a className="navbar-home" href="#/">
              {brand}
            </a>
          ) : (
            <span className="navbar-home navbar-home-static">{brand}</span>
          )}
          {trail && trail.length > 0 && <Trail trail={trail} compact={compact} />}
        </div>

        <div className="navbar-tail">
          {/* Never collapses, at any width. A hosted seat is taken back
              at its cap whatever the candidate is doing, so the number
              they cannot guess must not be behind a tap. */}
          {session?.session && <SessionChip login="" session={session.session} />}
          {children}

          {/* Promotion, and the only thing width changes. The same items,
              in the same order, with the same labels and glyphs as the
              rows they were lifted out of. */}
          {!compact && nav && nav.length > 0 && (
            <nav className="navbar-nav" aria-label={strings.header.navLabel}>
              {nav.map((item) =>
                item.current ? (
                  <span key={item.to} className="navbar-link navbar-link-on" aria-current="page">
                    <Icon name={item.icon} className="navbar-link-glyph" />
                    {item.label}
                  </span>
                ) : (
                  <button
                    key={item.to}
                    type="button"
                    className="navbar-link"
                    onClick={() => navigate(item.to)}
                  >
                    <Icon name={item.icon} className="navbar-link-glyph" />
                    {item.label}
                  </button>
                ),
              )}
            </nav>
          )}

          <NavMenu label={strings.header.menuLabel}>
            {/* Order is fixed and does not vary by screen: go somewhere,
                then do something here, then this session. A section with
                nothing in it is absent; no section ever moves. */}
            {compact && nav && nav.length > 0 && (
              <NavMenuSection label={strings.header.menuGo}>
                {nav.map((item) => (
                  <NavMenuItem
                    key={item.to}
                    icon={item.icon}
                    label={item.label}
                    current={item.current}
                    onSelect={() => navigate(item.to)}
                  />
                ))}
              </NavMenuSection>
            )}

            {menuExtra}

            <NavMenuSection label={strings.header.menuThisApp}>
              <NavMenuItem
                icon={THEME_ICONS[themePref]}
                label={strings.theme.menuLabel}
                detail={strings.theme.labels[themePref]}
                onSelect={cycleTheme}
                // The one row meant to be pressed more than once: the
                // preference cycles System → Light → Dark, and a menu
                // that shut on the first press would make the third a
                // three-tap job.
                keepOpen
              />
              <NavMenuItem
                icon="help"
                label={strings.info.open}
                onSelect={() => setAbout(true)}
              />
            </NavMenuSection>

            {session && (
              <NavMenuSection label={strings.header.menuAccount}>
                <NavMenuFact icon="user" label={session.login} />
                {session.session && (
                  <NavMenuItem
                    icon="exit"
                    label={strings.hosted.endSession}
                    onSelect={() => setConfirming(true)}
                    danger
                  />
                )}
                <NavMenuItem
                  icon="exit"
                  label={strings.hosted.signOut}
                  onSelect={() => void signOut()}
                />
              </NavMenuSection>
            )}
          </NavMenu>
        </div>
      </header>

      {/* Both dialogs are raised HERE rather than by the rows that ask
          for them. A row lives inside the menu panel, which unmounts the
          moment it closes — and a dialog rendered underneath it would be
          destroyed by the very click that opened it. */}
      {confirming && session && (
        <EndSessionDialog onClose={() => setConfirming(false)} onChanged={session.onChanged} />
      )}
      {about && <InfoDrawer onClose={() => setAbout(false)} />}
    </>
  );
}

const THEME_ICONS: Record<string, IconName> = {
  system: "theme-auto",
  light: "theme-light",
  dark: "theme-dark",
};

/**
 * Where you are, and the way back.
 *
 * Wide: every step, with the earlier ones as links — the path read left
 * to right from the mark beside it.
 *
 * Narrow: one step. A back chevron labelled with where you ARE, not with
 * where it goes, because the label a candidate needs on a 390px row is
 * the answer to "what screen is this" — and the chevron already says the
 * other thing. It navigates to the nearest ancestor that has a route,
 * so a phone still gets the whole path's worth of behaviour out of one
 * control.
 */
function Trail({ trail, compact }: { trail: Crumb[]; compact: boolean }) {
  const here = trail[trail.length - 1];
  const parent = [...trail.slice(0, -1)].reverse().find((c) => c.to);

  if (compact) {
    if (!parent) {
      return <span className="navbar-crumb navbar-crumb-on">{here.label}</span>;
    }
    return (
      <button
        type="button"
        className="navbar-back"
        onClick={() => navigate(parent.to!)}
        aria-label={strings.header.backTo(parent.label)}
      >
        <Icon name="chevron-left" />
        <span className="navbar-crumb-here">{here.label}</span>
      </button>
    );
  }

  return (
    <nav className="navbar-trail" aria-label={strings.header.trailLabel}>
      {trail.map((crumb, i) => (
        <span key={`${crumb.label}-${i}`} className="navbar-crumb-step">
          <span className="navbar-crumb-sep" aria-hidden="true">
            <Icon name="chevron-right" />
          </span>
          {crumb.to ? (
            <button
              type="button"
              className="navbar-crumb navbar-crumb-link"
              onClick={() => navigate(crumb.to!)}
            >
              {crumb.label}
            </button>
          ) : (
            <span className="navbar-crumb navbar-crumb-on" aria-current="page">
              {crumb.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

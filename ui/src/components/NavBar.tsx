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

export interface NavItem {
  label: string;
  to: string;
  icon: IconName;
  current?: boolean;
}

export interface Crumb {
  label: string;
  to?: string;
}

export interface NavBarProps {
  trail?: Crumb[];
  nav?: NavItem[];

  session?: { login: string; session?: HostedSession; onChanged: () => void };

  children?: ReactNode;

  menuExtra?: ReactNode;

  home?: boolean;
}

export function NavBar({ trail, nav, session, children, menuExtra, home = true }: NavBarProps) {
  const [confirming, setConfirming] = useState(false);
  const [about, setAbout] = useState(false);
  const [themePref, cycleTheme] = useTheme();

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

          {session?.session && <SessionChip login="" session={session.session} />}
          {children}

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

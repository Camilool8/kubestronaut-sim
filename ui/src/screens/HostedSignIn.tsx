import type { Me } from "../api";
import { BrandMark } from "../components/BrandMark";
import { NavBar } from "../components/NavBar";
import { strings } from "../strings";

/**
 * The GitHub mark, drawn here rather than added to the icon set.
 *
 * It is a third-party logo: filled, on a fixed 16 grid, and not ours to
 * restyle. Icon.tsx is a set of monochrome 24-grid outlines that any call
 * site may tint and scale, and a logo in that drawer would eventually be
 * treated as one of them. It takes `currentColor` so it sits correctly on
 * the button in both themes, which is the one liberty GitHub's brand
 * guidance allows and the only one taken.
 */
function GitHubMark() {
  return (
    <svg
      className="signin-github-mark"
      viewBox="0 0 16 16"
      width="1.15em"
      height="1.15em"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/**
 * The one screen a signed-out visitor sees.
 *
 * It exists only in hosted mode. The local product has no accounts and
 * gains none — this is served by the hub, in front of a facilitator that
 * still has no authentication of any kind and never learns that any of
 * this happened.
 *
 * It is the only screen in the product with NO HEADER, which is what made
 * the first draft of it look like a different application: a left-aligned
 * page heading floating at the top of an empty viewport, with the product
 * mark, the wordmark and the theme control — all of them header furniture
 * everywhere else — simply missing. So this screen carries its own. The
 * mark and wordmark move to the top of the card, the theme toggle keeps
 * the corner it has on every other screen, and the whole thing is
 * centred: a door, not a truncated page.
 *
 * Seat counts before sign-in, deliberately: someone deciding whether to
 * create an account here is entitled to know whether there is anywhere to
 * sit. It is a capacity number, not a fact about anyone.
 */
export function HostedSignIn({ me }: { me: Me }) {
  const seats = me.seats?.practical;
  // The other flavour is not a footnote: it is thirty seats that need no
  // cluster, and a visitor who reads "all 3 seats in use" and leaves was
  // told something true about a third of what is on offer.
  const mcq = me.seats?.mcq;
  const mcqLine = mcq ? strings.hosted.signInSeatsMcq(mcq.total - mcq.used) : "";

  return (
    <div className="signin">
      {/* The same navbar as every other screen, with the sections that
          need an account simply absent. It used to carry a bespoke
          theme button in a corner of its own, which made this the one
          screen where the app's chrome was a different object — and the
          front door is the worst place to teach someone a layout they
          will not see again. The card below still draws the mark large,
          because that is this screen's subject rather than its
          furniture. */}
      <NavBar />

      <main className="signin-main">
        <div className="signin-card">
          <div className="signin-brand">
            <BrandMark className="signin-mark" />
            <span className="signin-wordmark">
              {strings.header.wordmark}
              <span className="signin-wordmark-tail">{strings.header.wordmarkTail}</span>
            </span>
          </div>

          <h1 className="signin-title">{strings.hosted.signInTitle}</h1>
          <p className="signin-lead">{strings.hosted.signInLead}</p>

          {me.loginURL ? (
            <>
              {/* A link and not a fetch: the OAuth flow is a redirect to
                  GitHub and back, and there is nothing for JavaScript to
                  do in the middle of it. */}
              <a className="btn btn-primary signin-github" href={me.loginURL}>
                <GitHubMark />
                {strings.hosted.signInGitHub}
              </a>
              {/* What the button actually does, said before it is pressed.
                  The hub requests NO OAuth scopes (hub/internal/auth:
                  GitHub), which is the difference between signing in and
                  granting an app your repositories — and a visitor cannot
                  read that comment. */}
              <p className="signin-scope">{strings.hosted.signInScope}</p>

              {seats && (
                <p className="signin-seats" role="status">
                  <span className="signin-seats-dot" data-full={seats.used >= seats.total || undefined} aria-hidden="true" />
                  <span>
                    {strings.hosted.signInSeats(seats.used, seats.total)}
                    {mcqLine && <span className="signin-seats-mcq">{mcqLine}</span>}
                  </span>
                </p>
              )}
            </>
          ) : (
            // AUTH_MODE=header or none, reached without the header being
            // set. There is genuinely no login here, and offering a button
            // that 404s would be worse than saying so.
            <p className="signin-unavailable" role="alert">
              {strings.hosted.signInUnavailable}
            </p>
          )}
        </div>

        <p className="signin-local">{strings.hosted.signInLocal}</p>
      </main>
    </div>
  );
}

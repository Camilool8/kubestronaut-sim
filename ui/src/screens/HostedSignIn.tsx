import type { Me } from "../api";
import { strings } from "../strings";

/**
 * The one screen a signed-out visitor sees.
 *
 * It exists only in hosted mode. The local product has no accounts and
 * gains none — this is served by the hub, in front of a facilitator that
 * still has no authentication of any kind and never learns that any of
 * this happened.
 *
 * Seat counts before sign-in, deliberately: someone deciding whether to
 * create an account here is entitled to know whether there is anywhere
 * to sit. It is a capacity number, not a fact about anyone.
 */
export function HostedSignIn({ me }: { me: Me }) {
  const seats = me.seats?.practical;
  // The other flavour is not a footnote: it is thirty seats that need no
  // cluster, and a visitor who reads "all 3 seats in use" and leaves was
  // told something true about a third of what is on offer.
  const mcq = me.seats?.mcq;

  return (
    <div className="page hosted-screen">
      <header className="page-head">
        <div>
          <h1>{strings.hosted.signInTitle}</h1>
          <p className="page-lead">{strings.hosted.signInLead}</p>
        </div>
      </header>

      <div className="hosted-card">
        {me.loginURL ? (
          <>
            {/* A link and not a fetch: the OAuth flow is a redirect to
                GitHub and back, and there is nothing for JavaScript to
                do in the middle of it. */}
            <a className="btn btn-primary hosted-signin" href={me.loginURL}>
              {strings.hosted.signInGitHub}
            </a>
            {seats && (
              <p className="hosted-seats" role="status">
                {strings.hosted.signInSeats(seats.used, seats.total)}{" "}
                {mcq && strings.hosted.signInSeatsMcq(mcq.total - mcq.used)}
              </p>
            )}
          </>
        ) : (
          // AUTH_MODE=header or none, reached without the header being
          // set. There is genuinely no login here, and offering a button
          // that 404s would be worse than saying so.
          <p className="hosted-unavailable" role="alert">
            {strings.hosted.signInUnavailable}
          </p>
        )}
      </div>

      <p className="hosted-local">{strings.hosted.signInLocal}</p>
    </div>
  );
}

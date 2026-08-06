import type { Me } from "../api";
import { BrandMark } from "../components/BrandMark";
import { NavBar } from "../components/NavBar";
import { strings } from "../strings";

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

export function HostedSignIn({ me }: { me: Me }) {
  const seats = me.seats?.practical;

  const mcq = me.seats?.mcq;
  const mcqLine = mcq ? strings.hosted.signInSeatsMcq(mcq.total - mcq.used) : "";

  return (
    <div className="signin">

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

              <a className="btn btn-primary signin-github" href={me.loginURL}>
                <GitHubMark />
                {strings.hosted.signInGitHub}
              </a>

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

import { useCallback, useEffect, useState } from "react";
import { pollSession, type SessionSnapshot } from "./api";
import { Start } from "./screens/Start";
import { Exam } from "./screens/Exam";
import { Score } from "./screens/Score";

// The visible screen is a pure function of session.state — no router.
// App owns the single session poller (10s interval + window focus) and
// the poll timestamp that Exam/TimerBar anchor their 1Hz local tick to,
// so every screen transition and every timer resync flows from one
// source of truth.
export default function App() {
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number>(() => Date.now());
  const [pollError, setPollError] = useState<string | null>(null);

  const applySession = useCallback((next: SessionSnapshot) => {
    setSession(next);
    setFetchedAt(Date.now());
    setPollError(null);
  }, []);

  useEffect(() => {
    return pollSession(applySession, (err) => setPollError(String(err)));
  }, [applySession]);

  if (!session) {
    return (
      <div className="loading-screen">
        {pollError ? `Cannot reach facilitator: ${pollError}` : "Loading…"}
      </div>
    );
  }

  switch (session.state) {
    case "idle":
      return <Start onSessionChange={applySession} />;
    case "running":
      return (
        <Exam session={session} fetchedAt={fetchedAt} onSessionChange={applySession} />
      );
    case "ended":
      return <Score />;
    default:
      return null;
  }
}

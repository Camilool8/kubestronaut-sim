**requestMirror (shadow traffic)** is correct: `RequestMirror` implements shadowing: production keeps being served by the main backend while the new version receives identical traffic for error/latency validation — no user risk (unlike canary, which serves real responses).

Why the others are wrong:

- **urlRewrite** — URLRewrite changes the path or host of a request that still goes to one backend; nothing is copied.
- **retryPolicy** — retries resend a request to the same backend after a failure; they do not duplicate traffic to a second version.
- **backendRefs with weight 50/50** — a 50/50 split sends real users to the new version and their responses come from it — the risk shadowing is meant to avoid.

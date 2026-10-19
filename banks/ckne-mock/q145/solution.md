**Everything on the hostname(s)/listener** is correct: With no explicit matches, `PathPrefix /` is assumed. Combined with precedence rules (most specific wins), a misplaced catch-all explains many "why did this route serve it?" cases.

Why the others are wrong:

- **Nothing — matches is mandatory** — `matches` is optional; an omitted match defaults to `PathPrefix: /`.
- **Only GET /** — the default is a prefix match on `/`, which covers every path and every method.
- **Only HTTPS** — the protocol is decided by the listener the route attaches to, not by the presence of matches.

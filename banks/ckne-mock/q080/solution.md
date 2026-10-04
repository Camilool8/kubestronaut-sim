**Only the intersection is served** is correct: Listener↔route binding considers the hostname intersection: only names compatible with the listener hostname are programmed. The HTTPRoute status (Accepted/ResolvedRefs) shows the attach result — always check with `kubectl describe httproute`.

Why the others are wrong:

- **Both hostnames work** — `app.other.com` matches no listener hostname, so no listener accepts it; only names inside the listener's wildcard are programmed.
- **The Gateway adopts app.other.com automatically** — the Gateway's listeners are owned by the infrastructure operator; a route cannot widen them.
- **The whole route is rejected** — a partial hostname overlap does not reject the route — it attaches with the compatible names and reports the situation in its status conditions.

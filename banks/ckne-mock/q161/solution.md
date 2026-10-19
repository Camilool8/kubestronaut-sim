**It DENIES all traffic in the namespace** is correct: Cruel inversion: having an ALLOW AuthorizationPolicy that matches nothing = nothing is allowed. It's even the idiomatic way to do deny-all. Compare with NetworkPolicy `ingress: [{}]` (allows everything) — the empties have opposite semantics!

Why the others are wrong:

- **It only logs, without blocking** — AuthorizationPolicy has no log-only action; an ALLOW policy either matches or it does not, and a non-match is a denial.
- **A validation error** — an empty spec is valid — it is the documented idiom for deny-all.
- **It allows everything (empty spec = no restriction)** — the inversion is the trap: an ALLOW policy with no rules allows nothing, so everything not matched is denied.

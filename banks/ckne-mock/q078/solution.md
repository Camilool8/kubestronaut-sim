**The more specific rule — longest path prefix** is correct: Gateway API precedence is deterministic: exact > longest prefix, then number of matched headers/query params; ties between HTTPRoutes go to the oldest (with alphabetical order as final tie-breaker). This avoids routing ambiguity.

Why the others are wrong:

- **Always the first in the YAML** — YAML order is not a tie-breaker in Gateway API; precedence is defined by match specificity so that behaviour does not depend on how a file was written.
- **The choice is random** — the spec defines a deterministic order precisely so that two conformant implementations route the same request the same way.
- **Neither; the request is rejected with a 404** — overlapping rules are legal and common (a general prefix plus a specific one); the request is served by the most specific match.

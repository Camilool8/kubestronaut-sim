**Whether the header match sits in the SAME rule as the weights** is correct: Structure trap: header-based canary requires a separate rule (header match) evaluated as more specific; the weights-only rule stays as fallback. Mixing everything in one rule produces a weighted lottery for everyone.

Why the others are wrong:

- **The browser strips headers** — browsers send custom headers set by the application; they do not silently drop `x-beta`.
- **The Gateway API doesn't support header matches** — header matching is a core HTTPRoute feature (`matches.headers`).
- **Weights always beat headers** — precedence goes to the more specific match — a header match beats a bare path match; weights only apply within the rule that matched.

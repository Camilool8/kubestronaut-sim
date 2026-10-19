**Multi-window burn-rate alerts** is correct: Burn rate = speed of error-budget consumption. Combined short+long windows catch acute incidents AND slow degradations, with very few false positives — canonical SRE practice for network SLOs.

Why the others are wrong:

- **A single fixed alert at 1% errors** — a single fixed threshold either fires on every short spike or sleeps through a slow drain of the budget; it cannot do both.
- **Turning alerts off at night** — the SLO is measured over the whole month, night included; silencing alerts hides burn rather than managing it.
- **Alert on every individual error** — a 99.9% target expects some errors; paging on each one produces constant noise and no signal.

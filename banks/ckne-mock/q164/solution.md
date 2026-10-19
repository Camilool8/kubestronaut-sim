**The rate() function detects counter resets** is correct: Essential PromQL semantics: `rate()`/`increase()` handle resets assuming continuity. Doing manual arithmetic with raw counters breaks on every restart — a common mistake in handcrafted queries.

Why the others are wrong:

- **Prometheus forbids restarts** — Prometheus has no opinion on restarts; it scrapes whatever the target reports.
- **Counters never reset** — counters reset whenever the process exporting them restarts; the graph survives because `rate()` accounts for that.
- **The kubelet resends the old data** — the kubelet reports the new container's counters from zero; nothing resends history.

**The average hides the tail: p99 exposes the worst 1% of requests** is correct: Network problems tend to live in the tail (retransmissions, queues, conntrack). With `histogram_quantile(0.99, rate(..._bucket[5m]))` you see the worst 1% — what users actually feel.

Why the others are wrong:

- **p99 uses less memory** — a histogram costs more to store than a single mean; the choice is about what it reveals, not about memory.
- **The average is impossible to compute in Prometheus** — `rate(_sum) / rate(_count)` gives the average; the objection is not that it cannot be computed but that it hides the tail.
- **There is no practical difference** — the tail can be ten times the average while the average barely moves; the two tell different stories.

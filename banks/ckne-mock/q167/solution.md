**Exploding cardinality: labels per ephemeral pod/veth/IP** is correct: Series per ephemeral entity (pod hash, veth, IP) accumulate forever. The golden rule of network observability: label by the STABLE (namespace/workload), not the ephemeral.

Why the others are wrong:

- **Grafana's dark theme** — the theme changes pixels on screen, not the number of series stored.
- **Charts with too many colors** — colours are a rendering choice; they do not create time series.
- **Too many dashboards open at once** — open dashboards add query load, not stored series; the storage cost comes from label cardinality at ingestion.

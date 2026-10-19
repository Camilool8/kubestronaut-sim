**Use port: 30000 with endPort: 32767 in the same entry** is correct: The `endPort` field defines the end of the range started at `port` (requires a numeric, not named, port). Stable since Kubernetes 1.25.

Why the others are wrong:

- **NetworkPolicy doesn't support ranges** — ranges are supported through `endPort`, stable since Kubernetes 1.25.
- **Use the RANGE protocol** — `protocol` accepts TCP, UDP and SCTP; there is no `RANGE` value.
- **Listing all 2768 ports one by one in several rules** — listing thousands of ports is technically possible but enormous and error-prone; `endPort` exists to make it unnecessary.

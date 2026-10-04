**hubble observe --verdict DROPPED** is correct: `hubble observe --verdict DROPPED` lists each drop with source→destination, port and reason (Policy denied, CT: connection tracking, unsupported L3...). It's the fastest path to find which NetworkPolicy is blocking a flow.

Why the others are wrong:

- **kubectl logs cilium** — the agent log records agent lifecycle and errors, not per-flow verdicts; flows are read from Hubble.
- **hubble encrypt --all --follow** — not a Hubble command; Hubble observes, it does not encrypt.
- **hubble delete flows --verdict ALL** — not a Hubble command, and deleting flows is not how you read them.

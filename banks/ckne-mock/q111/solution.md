**A short window for compromised certificates, no reliance on revocation** is correct: Short life = short exposure: a leaked certificate is worth hours, not years, and revocation (historically broken) becomes unnecessary. istio-agent/SPIRE renew SVIDs automatically before expiry, without restarting workloads.

Why the others are wrong:

- **To save disk space on the nodes** — certificates are a few kilobytes; storage is irrelevant to their lifetime.
- **To force daily pod restarts** — rotation happens inside the sidecar or agent, transparently — pods keep running through many renewals.
- **Because TLS mandates 24h expiry per an IETF rule** — no RFC mandates a 24-hour lifetime; TLS allows any validity period, and the short window is an operational choice.

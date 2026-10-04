**The flow log confirms the root cause** is correct: DROPPED flows targeting kube-dns:53 right after applying an egress policy = the unmistakable signature of the forgotten DNS rule. Hubble turns "DNS mysteriously stopped" into visible cause and effect.

Why the others are wrong:

- **kube-dns changed ports** — kube-dns has listened on port 53 since the beginning; a port change would show as connection refused or timeouts, not as a policy verdict.
- **CoreDNS crashed, taking resolution down** — a crashed CoreDNS would produce timeouts or SERVFAIL, and the drops would not carry a policy verdict.
- **Hubble is wrong for this kind of flow** — Hubble reports the datapath's own verdict; a `Policy denied` drop is the enforcement decision itself, not an inference.

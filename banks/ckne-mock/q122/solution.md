**Add the log plugin to the Corefile block** is correct: The `log` plugin prints each query (name, type, rcode, duration) to CoreDNS stdout. Given the volume, use temporarily or scoped (e.g., `log example.com`). For continuous, per-pod auditing, prefer Hubble DNS metrics/flows.

Why the others are wrong:

- **Permanent tcpdump on all nodes** — captures on every node cost CPU and disk, produce raw packets rather than parsed queries, and need reassembly to read — the resolver itself can log what it answered.
- **Enable audit on the kube-apiserver** — the API server audit log records API requests; DNS queries never reach the API server.
- **DNS logging is not possible** — CoreDNS has had a `log` plugin from the start; it is the standard way to see queries.

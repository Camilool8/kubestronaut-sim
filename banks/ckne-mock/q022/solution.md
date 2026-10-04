**30000–32767** is correct: The default is `30000–32767`, configurable on the kube-apiserver with `--service-node-port-range`. Each NodePort is opened on every node, forwarding to the Service endpoints.

Why the others are wrong:

- **8000–9000** — not a Kubernetes default; those ports are commonly used by applications and would collide with them.
- **1024–2048** — low ports are reserved for well-known host services; Kubernetes deliberately allocates NodePorts from a high range.
- **49152–65535** — that is the IANA ephemeral range clients use for outgoing connections; listening there would race against the host's own ephemeral ports.

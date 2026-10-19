**cilium status | grep Encryption** is correct: Three-layer validation: the agent reports the mode, `wg show` confirms peers with recent handshakes, and a capture on the physical NIC must show only WireGuard packets (UDP 51871) instead of clear payload between pod IPs.

Why the others are wrong:

- **kubectl get secrets** — Secrets hold configuration such as IPsec keys; their existence proves nothing about whether packets on the wire are encrypted.
- **ping between the pods** — ping succeeds equally over encrypted and plaintext paths; it shows reachability, not confidentiality.
- **Look at the pod colors in the dashboard** — dashboards colour by health and traffic; encryption status has to be read from the agent and the interface, not inferred from a hue.

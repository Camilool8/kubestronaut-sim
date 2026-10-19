**SNAT source-port exhaustion** is correct: SNAT multiplexes everything into (egressIP, port): the tuple (proto, srcIP, srcPort, dst) must be unique. At scale, the ~64k ports run out — port exhaustion. The typical symptom of a centralized NAT funnel.

Why the others are wrong:

- **DNS limit** — DNS limits produce resolution errors, not `cannot assign requested address`, which is a socket-level failure to obtain a source port.
- **The kernel bandwidth limit on the gateway node** — a bandwidth ceiling would slow transfers or drop packets; it does not refuse to open sockets.
- **Pods-per-node limit** — the pods-per-node limit blocks scheduling; it does not affect connections from pods that are already running.

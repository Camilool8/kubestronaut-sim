**Its traffic originates from the NODE's IP, not a pod IP with identity** is correct: hostNetwork pods "are the node" to the network. Many CNIs treat node IPs specially (kubelet probes must pass). Result: pod-identity policies don't restrict them as expected — careful with what runs in hostNetwork.

Why the others are wrong:

- **hostNetwork enables an administrative network mode** — there is no administrative network mode; hostNetwork simply places the pod in the node's namespace.
- **NetworkPolicies have a known bug with TCP keepalive** — no such bug; the behaviour is the expected consequence of where the packets originate.
- **The policy only covers TCP, and the access uses UDP** — policies cover whatever protocols they list; the question does not hinge on protocol but on identity.

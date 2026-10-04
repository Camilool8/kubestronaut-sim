**No: encryption covers traffic crossing the network BETWEEN nodes** is correct: The goal is protecting on-the-wire traffic against interception on the network. Packets between same-node pods travel only through local memory/bridge. If the requirement is to encrypt and authenticate EVERY logical hop, combine with mesh mTLS.

Why the others are wrong:

- **Yes, always** — same-node traffic never touches the physical network; the CNI has nothing to encrypt on the wire there.
- **Only for UDP** — encryption covers all IP traffic crossing between nodes, whatever the transport protocol.
- **Only if the pods are in different namespaces** — namespaces play no role; the boundary is the node, not the namespace.

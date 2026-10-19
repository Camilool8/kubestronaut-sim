**PeerAuthentication with mtls.mode: STRICT** is correct: `PeerAuthentication STRICT` (per namespace or mesh-wide) makes sidecars/ztunnel accept only mTLS. PERMISSIVE mode (default) accepts both — useful during migration, but should be closed in production.

Why the others are wrong:

- **NetworkPolicy with a tls field** — NetworkPolicy has no `tls` field and cannot inspect or require encryption.
- **Gateway with allowInsecure: false** — Gateway listeners configure inbound TLS at the edge; workload-to-workload authentication policy is not their concern, and there is no `allowInsecure` field.
- **DestinationRule with tls: DISABLE** — a DestinationRule configures the client side of a connection, and `DISABLE` turns TLS off — the opposite of enforcing mTLS.

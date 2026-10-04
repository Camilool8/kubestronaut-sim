**The target's certificate is for api.partner.com (SAN mismatch)** is correct: TLS trap: validation uses the name the CLIENT requested. Fix: call the real name, configure proper SNI/verification, or use a proxy that rewrites Host/SNI.

Why the others are wrong:

- **CoreDNS blocks TLS** — CoreDNS answers a CNAME and steps aside; it never sees the TLS handshake.
- **The ExternalName type supports neither HTTPS nor TLS passthrough** — ExternalName does not touch the connection at all — the client connects straight to the external host; the failure is in name validation, not in a missing feature.
- **A NodePort exposing port 443 is missing** — no NodePort is involved in an outbound connection from a pod to an external host.

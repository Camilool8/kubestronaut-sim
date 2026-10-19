**TLSRoute, on a TLS listener in Passthrough mode** is correct: `TLSRoute` matches the ClientHello SNI and forwards the encrypted stream intact to the backend (which terminates TLS). It's the mechanism to expose multiple end-to-end TLS services behind a single IP.

Why the others are wrong:

- **TCPRoute with the tls: true field enabled** — TCPRoute routes by port only and has no `tls` field; it cannot read the SNI.
- **HTTPRoute in Secure mode** — HTTPRoute requires the gateway to see HTTP, which means TLS has already been terminated; there is no `Secure` mode.
- **CertRoute with automatic SNI** — not a Gateway API resource.

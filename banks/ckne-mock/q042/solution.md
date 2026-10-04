**When the backend must terminate TLS itself** is correct: In `Passthrough`, the Gateway reads only the SNI from the ClientHello and forwards the encrypted bytes. You lose path/header routing (no L7 visibility), but the certificate stays under the backend's control.

Why the others are wrong:

- **When no certificate is available on the backend** — passthrough moves termination to the backend, so the backend is precisely the place that needs a certificate — without one it cannot serve TLS at all.
- **Passthrough is only for UDP** — TLSRoute is a TCP-based mechanism keyed on the TLS ClientHello; UDP has no TLS handshake to inspect.
- **Always, since it's faster** — passthrough gives up L7 routing, header manipulation and gateway-level observability; the trade-off only pays when end-to-end termination is required.

**Ephemeral port exhaustion** is correct: The "open-close per request" pattern kills the client before the server: ~28k ephemeral ports ÷ 60s of TIME_WAIT ≈ a ceiling of ~470 new connections/s per destination. Pooling fixes it in the architecture, not in sysctl.

Why the others are wrong:

- **The kernel is corrupted** — a corrupted kernel would fail unpredictably, not with a specific socket error that appears exactly when connection counts climb.
- **Low MTU** — a small MTU fragments or drops large packets; it does not prevent the kernel from allocating a local port.
- **Missing DNS** — the error is returned when the socket cannot obtain a source port; name resolution has already succeeded by then.

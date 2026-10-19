**PERMISSIVE ALSO accepts plaintext** is correct: Audit trap: PERMISSIVE exists for migration (accepts mTLS AND plaintext). Verify with a sidecar-less test connection — if it gets in, there is no enforcement. Close it with STRICT per namespace.

Why the others are wrong:

- **PERMISSIVE encrypts only half the packets** — PERMISSIVE does not partially encrypt; each connection is either mTLS or plaintext depending on what the client offered.
- **STRICT breaks TLS** — STRICT breaks only plaintext clients — which is the point; mTLS clients keep working.
- **None, PERMISSIVE is safe** — a posture that accepts plaintext cannot be called enforced, however the dashboard labels it.

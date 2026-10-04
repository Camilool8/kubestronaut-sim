**It reuses the prefix KV-cache, avoiding a full prefill** is correct: Prefill is the expensive part. If the prefix (e.g., a long system prompt) is already in a replica's KV-cache, sending the same conversation there saves that cost. "Blind" balancing spreads and wastes cache.

Why the others are wrong:

- **It reduces response size** — the output is the same tokens either way; the saving is on input processing, not on response bytes.
- **It compresses the model before each request** — models are not compressed per request; weights stay resident on the GPU.
- **It avoids the TLS handshake between the gateway and each replica** — handshake cost is negligible next to prefill compute, and the gateway usually keeps connections pooled anyway.

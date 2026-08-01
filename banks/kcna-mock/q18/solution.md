**The values are only base64-encoded, so anyone allowed to read the Secret can trivially decode them** is correct: Secret data is stored and displayed as base64, which is a reversible encoding, not encryption. A single `base64 --decode` reveals the original value, so real protection comes from RBAC limiting who can read Secrets and, optionally, enabling encryption at rest for etcd.

Why the others are wrong:

- **The values are encrypted with a key held by the kubelet, so they are safe** — the kubelet holds no Secret-encryption key; it simply receives Secret data to make it available to containers, and the API representation is plain base64.
- **The values are encrypted with the cluster's CA certificate and can only be decrypted by the API server** — the cluster CA is used for TLS identity, not for encrypting Secret contents; by default Secrets are not encrypted at all in the API response.
- **The values are one-way hashed, so the original data cannot be recovered** — hashing would make the data unusable by applications; Secrets must remain recoverable so containers can consume the actual values, and base64 decoding recovers them instantly.

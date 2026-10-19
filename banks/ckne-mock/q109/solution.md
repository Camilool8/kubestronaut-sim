**In the cilium-ipsec-keys Secret** is correct: Cilium reads the key/algorithm from the `cilium-ipsec-keys` Secret. Rotation is operational: generate a new key with an incremented ID and the agents transition without downtime. WireGuard, in contrast, manages per-node keys automatically.

Why the others are wrong:

- **Hardcoded in the agent image** — a key baked into an image is shared by every installation of that image and impossible to rotate — the opposite of a secret.
- **In a file on the admin's laptop** — the agents on every node must read the key; a file on one laptop is neither reachable nor a rotation mechanism.
- **No key is needed with IPsec** — IPsec is symmetric-key encryption; without a pre-shared key the agents cannot establish the security associations at all.

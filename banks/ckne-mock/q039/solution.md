**mTLS with automatically issued SPIFFE/SVID identities** is correct: Meshes give each workload a SPIFFE identity (e.g., `spiffe://cluster/ns/sa/…`) in short-lived X.509 certificates (SVIDs), establishing automatic mTLS based on ServiceAccount, not IP.

Why the others are wrong:

- **Basic Auth on the kubelet** — the kubelet's API is for the control plane and node operators, not for workload-to-workload authentication, and basic auth carries no per-pod identity.
- **A shared password distributed in a ConfigMap** — a shared secret proves membership in a group, not the identity of a specific workload, and cannot be rotated or revoked per pod.
- **The apiserver's NodeRestriction admission plugin** — NodeRestriction limits what a kubelet may modify in the API; it says nothing about traffic between pods.

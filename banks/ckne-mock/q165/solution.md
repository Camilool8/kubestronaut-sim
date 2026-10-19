**cilium connectivity test** is correct: `cilium connectivity test` is the canonical post-install/upgrade smoke test: it covers cases manual tests forget (hairpin, local/remote NodePort, L3–L7 policies, DNS) and pinpoints the exact failing scenario.

Why the others are wrong:

- **ping -c 1 8.8.8.8** — checks that one node can reach the internet; it exercises none of the cluster's Services, policies or DNS.
- **kubectl get all** — lists API objects; it sends no traffic.
- **cilium delete --all** — not a real command, and deleting resources tests nothing.

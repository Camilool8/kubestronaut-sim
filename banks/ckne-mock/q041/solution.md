**cert-manager (Issuer/ClusterIssuer)** is correct: `cert-manager` issues certificates via Issuers (ACME, internal CA, Vault) and writes them to TLS Secrets, renewing before expiry. With the `cert-manager.io/cluster-issuer` annotation on the Gateway, it's all automatic.

Why the others are wrong:

- **kubeadm certs renew scheduled via a CronJob** — `kubeadm certs renew` handles the control plane's own certificates (API server, etcd), not application certificates for Gateways.
- **openssl-operator** — not a real project; openssl is a library and CLI, not an operator that talks to ACME and manages Secrets.
- **kubelet serving certs** — kubelet serving certificates secure the kubelet's own endpoint and are issued by the cluster CA; they never appear on a Gateway.

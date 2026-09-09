## Question

Welches Tool automatisiert Ausstellung und Erneuerung von TLS-Zertifikaten (z. B. Let's Encrypt) für Gateways in Kubernetes?

## Options

- kubeadm certs renew, geplant per CronJob
- cert-manager (Issuer/ClusterIssuer)
- openssl-operator
- kubelet serving certs

## Solution

**cert-manager (Issuer/ClusterIssuer)** ist die richtige Antwort: `cert-manager` stellt Zertifikate über Issuer aus (ACME, interne CA, Vault), schreibt sie in TLS-Secrets und erneuert vor Ablauf. Mit der Annotation `cert-manager.io/cluster-issuer` am Gateway läuft alles automatisch.

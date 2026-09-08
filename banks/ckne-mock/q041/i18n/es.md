## Question

¿Qué herramienta automatiza la emisión y renovación de certificados TLS (por ejemplo, Let's Encrypt) para Gateways en Kubernetes?

## Options

- kubeadm certs renew programado mediante un CronJob
- cert-manager (Issuer/ClusterIssuer)
- openssl-operator
- kubelet serving certs

## Solution

**cert-manager (Issuer/ClusterIssuer)** es la respuesta correcta: `cert-manager` emite certificados mediante Issuers (ACME, CA interna, Vault) y los escribe en Secrets TLS, renovándolos antes de que caduquen. Con la annotation `cert-manager.io/cluster-issuer` en el Gateway, todo es automático.

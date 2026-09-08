## Question

Qual ferramenta automatiza emissão e renovação de certificados TLS (ex.: Let's Encrypt) para Gateways no Kubernetes?

## Options

- kubeadm certs renew agendado via CronJob
- cert-manager (Issuer/ClusterIssuer)
- openssl-operator
- kubelet serving certs

## Solution

**cert-manager (Issuer/ClusterIssuer)** é a resposta correta: O `cert-manager` emite certificados via Issuers (ACME, CA interna, Vault) e os grava em Secrets TLS, renovando antes de expirar. Com a annotation `cert-manager.io/cluster-issuer` no Gateway, tudo é automático.

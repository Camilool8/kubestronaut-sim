## Question

Quel outil automatise l'émission et le renouvellement de certificats TLS (ex. Let's Encrypt) pour les Gateways dans Kubernetes ?

## Options

- kubeadm certs renew planifié via CronJob
- cert-manager (Issuer/ClusterIssuer)
- openssl-operator
- kubelet serving certs

## Solution

**cert-manager (Issuer/ClusterIssuer)** est la bonne réponse : `cert-manager` émet des certificats via des Issuers (ACME, CA interne, Vault), les écrit dans des Secrets TLS et renouvelle avant expiration. Avec l'annotation `cert-manager.io/cluster-issuer` sur le Gateway, tout est automatique.

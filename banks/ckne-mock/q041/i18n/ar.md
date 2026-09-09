## Question

أي أداة تؤتمت إصدار وتجديد شهادات TLS، مثل Let's Encrypt، لـ Gateways في Kubernetes؟

## Options

- kubeadm certs renew داخل CronJob
- cert-manager عبر Issuer/ClusterIssuer
- openssl-operator
- kubelet serving certs

## Solution

**cert-manager عبر Issuer/ClusterIssuer** هي الإجابة الصحيحة: يصدر `cert-manager` الشهادات عبر Issuers مثل ACME أو CA داخلي أو Vault، ويكتبها في TLS Secrets ويجددها قبل الانتهاء. يمكن ربطه بـ Gateway عبر annotation ‏`cert-manager.io/cluster-issuer`.

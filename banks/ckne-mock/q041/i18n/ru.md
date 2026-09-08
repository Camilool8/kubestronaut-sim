## Question

Какой инструмент автоматизирует выпуск и обновление TLS-сертификатов, например Let's Encrypt, для Gateways в Kubernetes?

## Options

- kubeadm certs renew по расписанию через CronJob
- cert-manager (Issuer/ClusterIssuer)
- openssl-operator
- kubelet serving certs

## Solution

**cert-manager (Issuer/ClusterIssuer)** — правильный ответ: `cert-manager` выпускает сертификаты через Issuers (ACME, внутренний CA, Vault), записывает их в TLS Secrets и обновляет до истечения срока. С annotation `cert-manager.io/cluster-issuer` у Gateway процесс полностью автоматический.

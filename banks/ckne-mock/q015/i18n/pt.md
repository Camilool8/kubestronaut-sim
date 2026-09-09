## Question

O que o DNS retorna ao consultar um headless Service (clusterIP: None) com selector?

## Options

- Um registro CNAME para o kube-apiserver
- O ClusterIP do Service
- NXDOMAIN sempre
- Registros A/AAAA com os IPs de cada pod pronto

## Solution

**Registros A/AAAA com os IPs de cada pod pronto** é a resposta correta: Headless Services não têm VIP: o CoreDNS responde com os IPs dos pods. Em StatefulSets, cada pod ganha também um registro estável `pod.service.ns.svc.cluster.local` — essencial para bancos e descoberta por identidade.

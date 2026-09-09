## Question

Em uma malha Istio multi-cluster (multi-primary), os workloads do cluster A não confiam nos certificados do cluster B (erros de TLS). Qual é o requisito de identidade esquecido?

## Options

- Compartilhar a mesma root CA / trust domain
- Usar o mesmo namespace em ambos
- Desligar o mTLS temporariamente entre os clusters
- Atribuir IPs públicos a todos os pods do mesh

## Solution

**Compartilhar a mesma root CA / trust domain** é a resposta correta: Identidade federada exige raiz comum: cada cluster com sua CA auto-gerada = duas ilhas de confiança. Emita intermediárias da mesma raiz (ou use SPIRE federation) antes de conectar as malhas.

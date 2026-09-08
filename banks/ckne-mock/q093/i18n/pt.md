## Question

Na MCS API, qual a diferença entre um ServiceImport do tipo ClusterSetIP e do tipo Headless?

## Options

- ClusterSetIP fornece um VIP único balanceando entre clusters
- Não há diferença
- ClusterSetIP é só IPv4 e Headless é só IPv6
- Headless é sempre mais rápido que ClusterSetIP

## Solution

**ClusterSetIP fornece um VIP único balanceando entre clusters** é a resposta correta: Espelha o comportamento single-cluster: `ClusterSetIP` dá um VIP para consumo balanceado; `Headless` expõe cada backend com registros próprios — necessário quando o cliente precisa falar com instâncias específicas entre clusters.

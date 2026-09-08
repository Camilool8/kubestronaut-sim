## Question

Aplicando os "golden signals" à rede do cluster, qual conjunto de métricas corresponde a latência, tráfego, erros e saturação?

## Options

- Réplicas, nodes, namespaces e CRDs instalados no cluster
- Latência, bytes/s, erros 5xx/retrans e saturação de conntrack
- Commits, builds, deploys e rollbacks por dia
- CPU, memória, disco e uptime dos nós workers

## Solution

**Latência, bytes/s, erros 5xx/retrans e saturação de conntrack** é a resposta correta: Os quatro sinais mapeiam diretamente: p99 de latência, throughput (bytes/pps), taxa de erros (retrans/resets/drops/5xx) e saturação (conntrack entries/limit, qdisc drops, utilização de banda). Alertar sobre eles cobre a maioria das degradações de rede.

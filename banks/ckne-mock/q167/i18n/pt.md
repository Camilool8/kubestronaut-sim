## Question

Seu Grafana de rede por pod tem milhões de séries e o Prometheus consome dezenas de GB. A maior fonte do problema costuma ser:

## Options

- O tema escuro do Grafana
- Gráficos com cores demais
- Excesso de dashboards abertos ao mesmo tempo
- Cardinalidade explosiva: labels por pod/veth/IP efêmeros

## Solution

**Cardinalidade explosiva: labels por pod/veth/IP efêmeros** é a resposta correta: Séries por entidade efêmera (pod hash, veth, IP) acumulam para sempre. Regra de ouro de observabilidade de rede: rotule pelo ESTÁVEL (namespace/workload), não pelo efêmero.

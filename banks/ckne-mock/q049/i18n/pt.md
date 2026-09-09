## Question

Por que a latência p99 de um histograma é geralmente mais reveladora que a média para diagnosticar problemas de rede?

## Options

- A p99 usa menos memória
- A média é impossível de calcular no Prometheus
- Não há diferença prática
- A média esconde a cauda: a p99 expõe o pior 1% das requisições

## Solution

**A média esconde a cauda: a p99 expõe o pior 1% das requisições** é a resposta correta: Problemas de rede tendem a ser de cauda (retransmissões, filas, conntrack). Com `histogram_quantile(0.99, rate(..._bucket[5m]))` você enxerga o pior 1% — o que os usuários realmente sentem.

## Question

Por que o --cluster-cidr (pods) e o --service-cluster-ip-range JAMAIS podem se sobrepor?

## Options

- Porque o DNS exige ranges iguais
- Porque ClusterIPs são virtuais
- Podem se sobrepor sem problema
- Por estética de configuração

## Solution

**Porque ClusterIPs são virtuais** é a resposta correta: São planos de endereçamento distintos processados por mecanismos diferentes (rotas/CNI vs. regras de DNAT). Overlap gera o pior tipo de bug: intermitente e dependente da ordem das regras.

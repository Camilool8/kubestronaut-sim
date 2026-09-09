## Question

Você deletou e recriou um Service com o mesmo nome. As aplicações que gravaram o IP antigo pararam. Qual lição de arquitetura isso reforça?

## Options

- O IP antigo volta em 24h
- Deveriam usar o IP do pod diretamente
- Services não podem ser recriados
- ClusterIPs mudam a cada recriação do Service

## Solution

**ClusterIPs mudam a cada recriação do Service** é a resposta correta: O IP é alocado dinamicamente do service range na criação (a menos que spec.clusterIP fixe). O contrato estável do Kubernetes é o NOME. Cache de DNS na aplicação (JVM!) merece atenção pós-recreação.

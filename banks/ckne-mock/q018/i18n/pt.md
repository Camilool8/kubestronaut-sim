## Question

Para que todas as requisições de um mesmo cliente cheguem sempre ao mesmo pod via ClusterIP, qual configuração do Service você usa?

## Options

- publishNotReadyAddresses: true
- topologyKeys
- externalTrafficPolicy: Local
- sessionAffinity: ClientIP

## Solution

**sessionAffinity: ClientIP** é a resposta correta: `sessionAffinity: ClientIP` mantém afinidade por IP de origem (com `timeoutSeconds`, padrão 3h). É a única afinidade nativa em L4 — afinidade por cookie exige um proxy L7 (Ingress/Gateway).

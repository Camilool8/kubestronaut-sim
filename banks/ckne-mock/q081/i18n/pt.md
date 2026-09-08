## Question

O que o campo internalTrafficPolicy: Local faz em um Service?

## Options

- Bloqueia todo o tráfego vindo de fora do cluster
- Substitui o CoreDNS
- Entrega tráfego interno só a endpoints do nó do cliente
- Ativa mTLS interno

## Solution

**Entrega tráfego interno só a endpoints do nó do cliente** é a resposta correta: É o análogo interno do externalTrafficPolicy: útil para daemons por nó (ex.: agente de logs, node-local cache) onde cada pod deve falar com a instância do próprio nó — economizando saltos e latência.

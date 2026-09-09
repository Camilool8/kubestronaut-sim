## Question

Como implementar um canary release enviando 10% do tráfego para a versão nova usando Gateway API?

## Options

- Criar 10 réplicas da versão antiga e 1 da nova
- sessionAffinity: Canary no Service
- Dois backendRefs no HTTPRoute com pesos 90 e 10
- Usar dois Gateways com o mesmo hostname

## Solution

**Dois backendRefs no HTTPRoute com pesos 90 e 10** é a resposta correta: O HTTPRoute suporta traffic splitting nativo: múltiplos `backendRefs` com pesos. Também é possível rotear canary por header/cookie com `matches.headers` em uma rule separada.

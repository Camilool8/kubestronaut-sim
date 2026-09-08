## Question

Uma NetworkPolicy criada no namespace "prod" pode selecionar e isolar pods do namespace "dev"?

## Options

- Somente se o CNI for Calico
- Sim, com a annotation cross-namespace
- Não: NetworkPolicy é namespaced
- Sim, se usar namespaceSelector

## Solution

**Não: NetworkPolicy é namespaced** é a resposta correta: O `spec.podSelector` seleciona alvos SOMENTE no namespace da policy. O `namespaceSelector` aparece apenas nas regras from/to (definindo origens/destinos permitidos), nunca para escolher quem é isolado. Para escopo de cluster, use AdminNetworkPolicy ou CRDs do CNI.

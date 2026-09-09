## Question

No Calico, como criar um bloqueio explícito (deny) com precedência sobre regras de allow?

## Options

- É impossível negar explicitamente em qualquer CNI
- Policies do Calico com action: Deny e o campo order
- Com annotation deny=true na policy nativa
- Apagando o CNI

## Solution

**Policies do Calico com action: Deny e o campo order** é a resposta correta: As policies do Calico têm `order` e ações Allow/Deny/Log/Pass — um modelo de firewall clássico. Um Deny de order baixa vence allows posteriores. A API nativa não tem isso; por isso ambientes regulados usam CRDs do CNI ou AdminNetworkPolicy.

## Question

Qual NetworkPolicy implementa "default deny" de ingress para todos os pods de um namespace?

## Options

- podSelector: {} com policyTypes: [Ingress] e sem regras de ingress
- Excluir o namespace do CNI
- podSelector: deny-all com policyTypes: [Ingress]
- Uma policy com ingress: [{}] cobrindo todos os pods

## Solution

**podSelector: {} com policyTypes: [Ingress] e sem regras de ingress** é a resposta correta: Um `podSelector: {}` seleciona todos os pods; declarar `policyTypes: [Ingress]` sem regras bloqueia toda entrada. Atenção: `ingress: [{}]` faz o oposto — permite tudo.

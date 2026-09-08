## Question

Qual manifesto isola completamente todos os pods de um namespace (nenhum tráfego de entrada NEM de saída permitido)?

## Options

- Deletar todos os Services
- Apenas policyTypes: [Ingress] com podSelector: {}
- podSelector: {} com policyTypes: [Ingress, Egress] e sem nenhuma regra ingress/egress
- podSelector: {} com ingress: [{}] e egress: [{}] declarados

## Solution

**podSelector: {} com policyTypes: [Ingress, Egress] e sem nenhuma regra ingress/egress** é a resposta correta: Selecionar tudo e declarar ambos os policyTypes sem regras = default deny total. A variante com `[{}]` permite tudo (regra vazia casa qualquer origem/destino) — a pegadinha clássica do exame. A partir daí, cada acesso é liberado por policies adicionais.

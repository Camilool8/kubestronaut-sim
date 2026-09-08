## Question

O que a AdminNetworkPolicy (ANP) adiciona em relação à NetworkPolicy tradicional?

## Options

- Firewall para a internet apenas
- Substitui o RBAC para tráfego de rede
- Escopo de cluster, prioridade e ações Allow/Deny/Pass
- Nada, é apenas renomeação da NetworkPolicy

## Solution

**Escopo de cluster, prioridade e ações Allow/Deny/Pass** é a resposta correta: A ANP dá aos administradores guardrails não-sobrescrevíveis (ex.: "nunca permitir egress para metadados da nuvem") e a BANP define o default do cluster quando nenhuma policy do usuário decidir. Ordem: ANP → NetworkPolicy → BANP.

## Question

O Gateway está no namespace "infra" e o Secret TLS no namespace "apps". O listener referencia o Secret mas o status mostra RefNotPermitted. O que falta?

## Options

- Colocar o Gateway em kube-system
- Anotar o Secret como público
- Um ReferenceGrant em "apps" permitindo Gateways de "infra"
- Copiar o Secret manualmente para o namespace infra

## Solution

**Um ReferenceGrant em "apps" permitindo Gateways de "infra"** é a resposta correta: Referências cross-namespace a Secrets exigem consentimento explícito do dono do Secret: um `ReferenceGrant` em "apps" com from (Gateway/infra) e to (Secret). Sem ele, o Gateway API nega por segurança — evitando exfiltração de certificados.

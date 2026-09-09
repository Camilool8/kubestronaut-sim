## Question

Quais são duas limitações reais das NetworkPolicies nativas do Kubernetes?

## Options

- Não filtram por hostname/L7
- Só se aplicam ao namespace kube-system
- Exigem reinício dos pods a cada mudança
- Não funcionam com TCP

## Solution

**Não filtram por hostname/L7** é a resposta correta: A API nativa é L3/L4: sem regras por FQDN, método HTTP, deny explícito, prioridade ou log. CNIs estendem isso — `toFQDNs` e regras HTTP no Cilium, `action: Deny/Log` no Calico. Policies aplicam-se sem reiniciar pods.

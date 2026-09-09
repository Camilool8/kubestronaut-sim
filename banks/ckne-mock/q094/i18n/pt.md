## Question

No Cilium Cluster Mesh, como tornar um Service disponível e balanceado entre todos os clusters conectados?

## Options

- Mesmo nome/namespace + annotation service.cilium.io/global
- Expor via NodePort em todos os nós
- Copiar o ClusterIP manualmente
- Somente via Ingress compartilhado entre os clusters

## Solution

**Mesmo nome/namespace + annotation service.cilium.io/global** é a resposta correta: Com a annotation global, o Cilium funde os backends de todos os clusters no balanceamento. Extras: `service.cilium.io/affinity: local` prefere endpoints do cluster local, com failover automático para remotos se os locais caírem.

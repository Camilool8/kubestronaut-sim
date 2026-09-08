## Question

No Cilium Cluster Mesh, qual é o requisito fundamental de rede entre os clusters conectados?

## Options

- Um único etcd compartilhado entre os clusters
- PodCIDRs e ClusterIDs únicos
- Todos os clusters na mesma zona de disponibilidade
- Mesma versão exata do kernel em todos os nós

## Solution

**PodCIDRs e ClusterIDs únicos** é a resposta correta: Cluster Mesh exige CIDRs de pods não sobrepostos, `cluster.id`/`cluster.name` únicos e alcance mútuo entre nós. Com isso, há descoberta global de serviços, balanceamento cross-cluster e políticas entre clusters.

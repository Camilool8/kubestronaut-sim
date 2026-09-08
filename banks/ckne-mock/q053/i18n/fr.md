## Question

L'application signale une latence élevée entre deux services. node_netstat_Tcp_RetransSegs grimpe vite sur les nœuds concernés. Qu'est-ce que cela indique ?

## Options

- Perte de paquets sur le chemin
- Que le DNS est lent
- Qu'etcd a besoin d'une compaction
- Qu'il manque des répliques au Deployment

## Solution

**Perte de paquets sur le chemin** est la bonne réponse : Retransmissions TCP = perte de paquets (MTU/fragmentation, files pleines, mauvais lien). Coupable fréquent : mauvaise MTU avec un overlay (VXLAN consomme ~50 octets). Validez avec `ping -M do -s 1472`, `tcpdump` et la MTU du CNI.

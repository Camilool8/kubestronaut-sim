## Question

Avec Multus et des réseaux secondaires sur plusieurs nœuds, pourquoi l'IPAM whereabouts est-il préférable à host-local ?

## Options

- Parce que host-local exige un DHCP externe
- host-local alloue par nœud sans coordination et peut dupliquer des IPs
- Parce qu'il est plus rapide sur toutes les opérations ADD et DEL du CNI
- Parce que whereabouts ne supporte qu'IPv6

## Solution

**host-local alloue par nœud sans coordination et peut dupliquer des IPs** est la bonne réponse : `host-local` ne garde l'état que sur le disque du nœud — deux nœuds peuvent distribuer la même IP sur le réseau secondaire. `whereabouts` enregistre les allocations dans des CRD cluster, garantissant l'unicité sur tous les nœuds.

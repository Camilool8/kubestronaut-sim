## Question

Les pods du même nœud communiquent, mais pas ceux de nœuds différents. Le CNI utilise VXLAN. Cause la plus probable ?

## Options

- kube-scheduler est mal configuré
- Le port UDP du VXLAN est bloqué entre les nœuds
- Les pods ont besoin de hostPort pour le trafic inter-nœuds
- CoreDNS est tombé

## Solution

**Le port UDP du VXLAN est bloqué entre les nœuds** est la bonne réponse : Le trafic inter-nœuds dépend de l'encapsulation. Si un pare-feu bloque le port UDP VXLAN (8472 chez Flannel/Cilium, 4789 standard IANA), la communication inter-nœuds échoue. Vérifiez avec `tcpdump -i any udp port 8472` et les règles de pare-feu.

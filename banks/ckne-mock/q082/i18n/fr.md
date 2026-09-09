## Question

Endpoints corrects, pod-à-pod par IP OK, mais l'accès via ClusterIP échoue depuis tous les pods d'UN nœud précis. Suspect principal ?

## Options

- CoreDNS est tombé sur toutes les répliques
- Le kube-proxy de ce nœud est tombé ou n'a pas programmé les règles
- Le namespace est en cours de suppression
- L'image du conteneur est mauvaise

## Solution

**Le kube-proxy de ce nœud est tombé ou n'a pas programmé les règles** est la bonne réponse : Le ClusterIP est matérialisé PAR NŒUD (iptables/IPVS/eBPF). Si un seul nœud n'atteint pas les VIPs, la programmation locale est cassée : kube-proxy en crash, règles non synchronisées ou pare-feu local. Comparez `iptables-save | grep <svc>` entre nœuds.

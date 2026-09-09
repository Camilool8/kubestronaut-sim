## Question

Au redémarrage de l'agent BGP (upgrade Cilium/Calico) sur un nœud, le trafic des VIPs annoncés est tombé ~30 s jusqu'au rétablissement de la session. Quels deux mécanismes réduisent cet impact ?

## Options

- Remplacer BGP par L2 systématiquement
- BGP Graceful Restart (garde les routes pendant le restart) et BFD (détection en ms)
- Plus de répliques de CoreDNS et du kube-apiserver pendant l'upgrade
- Baisser la MTU des tunnels entre les nœuds

## Solution

**BGP Graceful Restart (garde les routes pendant le restart) et BFD (détection en ms)** est la bonne réponse : Le Graceful Restart distingue « restart planifié » de « nœud mort » et préserve le forwarding ; BFD accélère la détection quand le nœud meurt VRAIMENT (failover vers d'autres nœuds ECMP). Ensemble : upgrades sans blackholes et failover sous la seconde.

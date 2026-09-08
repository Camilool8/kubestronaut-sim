## Question

En appliquant les « golden signals » au réseau du cluster, quel ensemble correspond à latence, trafic, erreurs et saturation ?

## Options

- Répliques, nœuds, namespaces et CRDs installés dans le cluster
- Latence, octets/s, erreurs 5xx/retrans et saturation du conntrack
- Commits, builds, déploiements et rollbacks par jour
- CPU, mémoire, disque et uptime des nœuds workers

## Solution

**Latence, octets/s, erreurs 5xx/retrans et saturation du conntrack** est la bonne réponse : Les quatre signaux mappent directement : latence p99, débit (octets/pps), taux d'erreurs (retrans/resets/drops/5xx) et saturation (conntrack entries/limit, drops de qdisc, bande passante). Alerter dessus couvre la plupart des dégradations réseau.

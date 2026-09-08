## Question

Dans un Service, quelle est la différence entre port, targetPort et nodePort ?

## Options

- Ce sont des synonymes
- port est le port du Service lui-même
- Seul nodePort est obligatoire
- port appartient au conteneur, targetPort au nœud, nodePort au Service

## Solution

**port est le port du Service lui-même** est la bonne réponse : Le client atteint `ClusterIP:port` ; kube-proxy fait un DNAT vers `podIP:targetPort` ; si le type expose les nœuds, `nodePort` est le port externe de chaque nœud. Confondre port et targetPort est une cause fréquente de « connection refused ».

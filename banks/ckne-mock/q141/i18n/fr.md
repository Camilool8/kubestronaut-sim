## Question

Le Service est correct (port 80 → targetPort 8080), endpoints prêts, mais chaque connexion donne « connection refused ». Dans le pod, `ss -tlnp` montre le process sur 127.0.0.1:8080. Le problème ?

## Options

- kube-proxy est tombé sur ce nœud
- L'application n'écoute que sur localhost
- Il faut hostNetwork
- Le port 8080 est réservé par le kubelet

## Solution

**L'application n'écoute que sur localhost** est la bonne réponse : Piège n° 1 du « refused » avec tout apparemment correct : bind sur loopback. Le DNAT livre sur l'IP du pod (eth0), où personne n'écoute — l'appli doit écouter sur 0.0.0.0. `ss -tlnp` dans le pod le révèle instantanément.

## Question

Que renvoie le DNS pour une requête vers un Service headless (clusterIP: None) avec sélecteur ?

## Options

- Un CNAME vers le kube-apiserver
- Le ClusterIP du Service, comme d'habitude
- Toujours NXDOMAIN, car il n'y a pas de VIP
- Des enregistrements A/AAAA avec les IPs de chaque pod prêt

## Solution

**Des enregistrements A/AAAA avec les IPs de chaque pod prêt** est la bonne réponse : Les Services headless n'ont pas de VIP : CoreDNS répond avec les IPs des pods. Dans les StatefulSets, chaque pod reçoit aussi un enregistrement stable `pod.service.ns.svc.cluster.local` — essentiel pour les bases de données et la découverte par identité.

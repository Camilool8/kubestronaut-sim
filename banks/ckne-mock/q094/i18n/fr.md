## Question

Dans Cilium Cluster Mesh, comment rendre un Service disponible et balancé sur tous les clusters connectés ?

## Options

- Même nom/namespace + annotation service.cilium.io/global
- L'exposer en NodePort sur tous les nœuds
- Copier le ClusterIP manuellement
- Uniquement via un Ingress partagé entre clusters

## Solution

**Même nom/namespace + annotation service.cilium.io/global** est la bonne réponse : Avec l'annotation global ("true"), Cilium fusionne les backends de tous les clusters dans le balancing. Bonus : `service.cilium.io/affinity: local` privilégie les endpoints du cluster local, avec failover automatique vers les distants.

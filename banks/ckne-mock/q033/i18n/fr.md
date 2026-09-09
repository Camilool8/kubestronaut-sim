## Question

Dans Cilium Cluster Mesh, quelle est l'exigence réseau fondamentale entre les clusters connectés ?

## Options

- Un seul etcd partagé entre clusters
- PodCIDRs et ClusterIDs uniques
- Tous les clusters dans la même zone de disponibilité
- Exactement la même version de kernel sur tous les nœuds

## Solution

**PodCIDRs et ClusterIDs uniques** est la bonne réponse : Cluster Mesh exige des pod CIDRs sans chevauchement, des `cluster.id`/`cluster.name` uniques et une joignabilité mutuelle des nœuds. On obtient alors découverte globale, balancing inter-clusters et policies trans-clusters.

## Question

Dans la MCS API, quelle différence entre un ServiceImport de type ClusterSetIP et un de type Headless ?

## Options

- ClusterSetIP fournit un VIP unique balançant entre clusters
- Aucune différence
- ClusterSetIP est IPv4 seulement et Headless IPv6 seulement
- Headless est toujours plus rapide que ClusterSetIP

## Solution

**ClusterSetIP fournit un VIP unique balançant entre clusters** est la bonne réponse : Cela reflète le comportement mono-cluster : `ClusterSetIP` donne un VIP pour une consommation balancée ; `Headless` expose chaque backend avec ses propres enregistrements — nécessaire quand le client doit parler à des instances précises (StatefulSets multi-clusters).

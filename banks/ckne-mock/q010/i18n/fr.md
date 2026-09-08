## Question

Quel comportement réseau présente un pod avec hostNetwork: true ?

## Options

- Il perd la connectivité externe
- Il reçoit une IP du pod CIDR comme d'habitude
- Il ne parle qu'aux pods du même namespace
- Il partage le namespace réseau du nœud et utilise l'IP du nœud

## Solution

**Il partage le namespace réseau du nœud et utilise l'IP du nœud** est la bonne réponse : Avec `hostNetwork: true`, le pod n'a pas de netns propre : il utilise l'IP et les interfaces du nœud. Les ports ouverts entrent en concurrence avec les processus de l'hôte (risque de conflit), et les NetworkPolicies par podSelector ne s'appliquent généralement pas comme prévu.

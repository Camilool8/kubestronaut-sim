## Question

Qu'essaie d'optimiser le Topology Aware Routing (topology hints, ex. service.kubernetes.io/topology-mode: Auto), et quel est le compromis ?

## Options

- Chiffrer tout le trafic ; le compromis est le CPU
- Garder le trafic dans la même zone de disponibilité
- Réduire les lookups DNS ; le compromis est le cache
- Augmenter les répliques ; le compromis est la mémoire

## Solution

**Garder le trafic dans la même zone de disponibilité** est la bonne réponse : Avec les hints, chaque kube-proxy privilégie les endpoints de sa zone — réduisant coûts inter-AZ et latence. Compromis : déséquilibre possible si les endpoints sont mal répartis entre zones ; le mécanisme désactive les hints en cas de forte asymétrie.

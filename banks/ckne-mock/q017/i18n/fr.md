## Question

Quelle ressource a remplacé l'objet Endpoints comme mécanisme principal et scalable de suivi des backends d'un Service ?

## Options

- EndpointSlice
- PodDisruptionBudget
- BackendConfig
- ServiceEntry

## Solution

**EndpointSlice** est la bonne réponse : `EndpointSlice` partitionne les endpoints en tranches (jusqu'à 100 par slice par défaut), réduisant le coût de mise à jour des gros Services et ajoutant la topologie (zone, nœud). L'ancien objet Endpoints subsiste pour compatibilité.

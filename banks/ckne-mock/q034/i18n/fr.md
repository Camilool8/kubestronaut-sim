## Question

Quelle NetworkPolicy implémente le « default deny » d'ingress pour tous les pods d'un namespace ?

## Options

- podSelector: {} avec policyTypes: [Ingress] et sans règles d'ingress
- Exclure le namespace du CNI
- podSelector: deny-all avec policyTypes: [Ingress]
- Une policy avec ingress: [{}] couvrant tous les pods

## Solution

**podSelector: {} avec policyTypes: [Ingress] et sans règles d'ingress** est la bonne réponse : Un `podSelector: {}` sélectionne tous les pods ; déclarer `policyTypes: [Ingress]` sans règles bloque tout le trafic entrant. Attention : `ingress: [{}]` fait l'inverse — il autorise tout.

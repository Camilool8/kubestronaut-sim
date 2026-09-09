## Question

Comment implémenter un canary envoyant 10 % du trafic à la nouvelle version avec la Gateway API ?

## Options

- Créer 10 répliques de l'ancienne version et 1 de la nouvelle
- sessionAffinity: Canary sur le Service
- Deux backendRefs dans l'HTTPRoute avec poids 90 et 10
- Deux Gateways avec le même hostname

## Solution

**Deux backendRefs dans l'HTTPRoute avec poids 90 et 10** est la bonne réponse : HTTPRoute supporte le traffic splitting natif : plusieurs `backendRefs` avec des poids. On peut aussi router le canary par header/cookie via `matches.headers` dans une règle séparée.

## Question

Dans la Gateway API, quelle est la bonne répartition des rôles entre Gateway et HTTPRoute ?

## Options

- Les deux font pareil, HTTPRoute est juste le nouveau nom
- Gateway définit les règles de routage ; HTTPRoute définit les listeners
- Gateway est géré par l'équipe d'infrastructure et définit listeners/adresses
- HTTPRoute remplace le Service ; Gateway remplace le Deployment

## Solution

**Gateway est géré par l'équipe d'infrastructure et définit listeners/adresses** est la bonne réponse : Modèle par personas : `GatewayClass` (implémentation), `Gateway` (infra : listeners, ports, TLS) et `HTTPRoute` (app : matches, filtres, backends). La route référence le Gateway dans `parentRefs` et les Services dans `backendRefs`.

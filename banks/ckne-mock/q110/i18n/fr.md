## Question

Dans Istio, quelle ressource et quel mode forcent TOUT le trafic reçu par les workloads d'un namespace à être en mTLS, rejetant le clair ?

## Options

- NetworkPolicy avec un champ tls
- Gateway avec allowInsecure: false
- PeerAuthentication avec mtls.mode: STRICT
- DestinationRule avec tls: DISABLE

## Solution

**PeerAuthentication avec mtls.mode: STRICT** est la bonne réponse : `PeerAuthentication STRICT` (par namespace ou mesh-wide) fait que sidecars/ztunnel n'acceptent que le mTLS. Le mode PERMISSIVE (défaut) accepte les deux — utile en migration, mais à fermer en production.

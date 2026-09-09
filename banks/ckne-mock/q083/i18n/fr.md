## Question

Quel est le rôle de la GatewayClass dans la Gateway API ?

## Options

- Définir l'implémentation/le contrôleur qui matérialise les Gateways
- Grouper les HTTPRoutes par version
- Définir les certificats TLS
- Remplacer obligatoirement l'IngressClass du cluster

## Solution

**Définir l'implémentation/le contrôleur qui matérialise les Gateways** est la bonne réponse : `GatewayClass` (cluster-scoped) dit QUI implémente : `controllerName` pointe le contrôleur (istio.io/gateway-controller, gateway.envoyproxy.io/…). Un cluster peut avoir plusieurs classes (interne, externe, mesh) ; chaque Gateway en référence une — analogue à la StorageClass.

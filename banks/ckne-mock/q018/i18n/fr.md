## Question

Pour que toutes les requêtes d'un même client atteignent toujours le même pod via ClusterIP, quel réglage du Service ?

## Options

- publishNotReadyAddresses: true
- topologyKeys
- externalTrafficPolicy: Local
- sessionAffinity: ClientIP

## Solution

**sessionAffinity: ClientIP** est la bonne réponse : `sessionAffinity: ClientIP` maintient l'affinité par IP source (avec `timeoutSeconds`, 3 h par défaut). C'est la seule affinité L4 native — l'affinité par cookie exige un proxy L7 (Ingress/Gateway).

## Question

Damit alle Requests desselben Clients per ClusterIP immer denselben Pod erreichen — welche Service-Einstellung?

## Options

- publishNotReadyAddresses: true
- topologyKeys
- externalTrafficPolicy: Local
- sessionAffinity: ClientIP

## Solution

**sessionAffinity: ClientIP** ist die richtige Antwort: `sessionAffinity: ClientIP` hält Affinität nach Quell-IP (mit `timeoutSeconds`, Standard 3 h). Es ist die einzige native L4-Affinität — Cookie-Affinität erfordert einen L7-Proxy (Ingress/Gateway).

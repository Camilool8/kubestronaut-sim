## Question

Eine HTTPRoute in einem anderen Namespace als das Gateway funktioniert nicht. Was muss meist angepasst werden?

## Options

- Das Feld listeners.allowedRoutes.namespaces des Gateways
- Der Backend-Service muss NodePort sein
- HTTPRoutes funktionieren ausnahmslos nur im Gateway-Namespace
- Die HTTPRoute braucht hostNetwork

## Solution

**Das Feld listeners.allowedRoutes.namespaces des Gateways** ist die richtige Antwort: Standardmäßig ist `allowedRoutes.namespaces.from` = `Same`. Für Routen aus anderen Namespaces am Listener `from: All` oder `from: Selector` setzen. Für Backends in fremden Namespaces braucht es zusätzlich einen `ReferenceGrant`.

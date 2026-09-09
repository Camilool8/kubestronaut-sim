## Question

Wie validiert man zusätzlich zur Workload-mTLS-Identität ENDNUTZER-JWTs auf Requests an einen Istio-Service?

## Options

- RequestAuthentication + AuthorizationPolicy mit requestPrincipals
- Native NetworkPolicy mit einem eigenen jwt-Feld
- Basic Auth in einer ConfigMap
- Validierung nur im Frontend, vor dem Gateway

## Solution

**RequestAuthentication + AuthorizationPolicy mit requestPrincipals** ist die richtige Antwort: `RequestAuthentication` definiert die Token-Validierung (issuer, JWKS); allein lehnt es nur UNGÜLTIGE Tokens ab. Erst die `AuthorizationPolicy` mit `requestPrincipals: ["*"]` verlangt ein gültiges Token — die zwei Ebenen (Workload + User) ergänzen sich.

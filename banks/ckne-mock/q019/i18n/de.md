## Question

Wie ist in der Gateway API die Rollenteilung zwischen Gateway und HTTPRoute korrekt beschrieben?

## Options

- Beides ist identisch, HTTPRoute ist nur der neue Name
- Gateway definiert Routing-Regeln; HTTPRoute definiert Listener
- Gateway wird vom Infrastruktur-Team verwaltet und definiert Listener/Adressen
- HTTPRoute ersetzt den Service; Gateway ersetzt das Deployment

## Solution

**Gateway wird vom Infrastruktur-Team verwaltet und definiert Listener/Adressen** ist die richtige Antwort: Persona-Modell: `GatewayClass` (Implementierung), `Gateway` (Infra: Listener, Ports, TLS) und `HTTPRoute` (App: Matches, Filter, Backends). Die Route referenziert das Gateway in `parentRefs` und Services in `backendRefs`.

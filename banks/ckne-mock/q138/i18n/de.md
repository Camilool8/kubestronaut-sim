## Question

Welchen Effekt hat sessionAffinity: ClientIP an einem HEADLESS Service?

## Options

- Kein praktischer Effekt auf den Flow
- Macht den Service zum NodePort
- Immer ein Validierungsfehler
- Perfekte Affinität pro Client

## Solution

**Kein praktischer Effekt auf den Flow** ist die richtige Antwort: Affinität ist eine Funktion des Proxys über dem VIP. Headless liefert pures DNS — der "Balancer" ist der Resolver/Client. Akzeptierte Konfiguration, null Wirkung: ein Prüfungsklassiker.

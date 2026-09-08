## Question

Vor der Promotion einer neuen Version wollen Sie eine KOPIE des echten Produktions-Traffics dorthin senden, ohne dass ihre Antworten Clients erreichen. Welcher HTTPRoute-Filter?

## Options

- requestMirror (Shadow Traffic)
- urlRewrite
- retryPolicy
- backendRefs mit Gewicht 50/50

## Solution

**requestMirror (Shadow Traffic)** ist die richtige Antwort: `RequestMirror` implementiert Shadowing: Produktion wird weiter vom Haupt-Backend bedient, während die neue Version identischen Traffic zur Fehler-/Latenz-Validierung erhält — ohne Nutzerrisiko (anders als Canary, das echte Antworten liefert).

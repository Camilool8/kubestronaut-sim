## Question

Wie implementieren Sie ein Canary-Release mit 10 % Traffic auf die neue Version per Gateway API?

## Options

- 10 Replikas der alten und 1 der neuen Version
- sessionAffinity: Canary am Service
- Zwei backendRefs in der HTTPRoute mit Gewichten 90 und 10
- Zwei Gateways mit demselben Hostname

## Solution

**Zwei backendRefs in der HTTPRoute mit Gewichten 90 und 10** ist die richtige Antwort: HTTPRoute unterstützt natives Traffic-Splitting: mehrere `backendRefs` mit Gewichten. Alternativ das Canary per Header/Cookie über `matches.headers` in einer eigenen Regel routen.

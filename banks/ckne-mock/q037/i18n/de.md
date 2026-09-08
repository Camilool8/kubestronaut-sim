## Question

Was ist der Unterschied zwischen diesen Ingress-Regeln?

```
(A) - from: [{namespaceSelector: X}, {podSelector: Y}]
(B) - from: [{namespaceSelector: X, podSelector: Y}]
```

## Options

- (B) ist syntaktisch ungültig und wird vom Apiserver abgelehnt
- Sie sind identisch
- (A) ist ODER zwischen den Quellen; (B) ist UND (Pods Y in Namespaces X)
- (A) gilt nur für Egress; (B) nur für Ingress

## Solution

**(A) ist ODER zwischen den Quellen; (B) ist UND (Pods Y in Namespaces X)** ist die richtige Antwort: Getrennte Einträge der `from`-Liste sind Alternativen (ODER); kombinierte Felder im selben Eintrag sind gemeinsame Bedingungen (UND). Ein zusätzlicher Bindestrich ändert den Zugriffsbereich komplett.

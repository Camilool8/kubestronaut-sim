## Question

Zwei Regeln einer HTTPRoute matchen denselben Request: eine mit Path /api, eine mit /api/v2. Welche gewinnt?

## Options

- Immer die erste im YAML
- Die Wahl ist zufällig
- Keine; der Request wird mit 404 abgelehnt
- Die spezifischste Regel — längster Path-Präfix

## Solution

**Die spezifischste Regel — längster Path-Präfix** ist die richtige Antwort: Die Gateway-API-Präzedenz ist deterministisch: exakt > längster Präfix, dann Methode, Header und Query-Params; bei Gleichstand gewinnt die älteste Route (creationTimestamp, dann alphabetisch). Das verhindert Routing-Ambiguität.

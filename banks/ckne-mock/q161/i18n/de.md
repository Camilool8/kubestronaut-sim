## Question

Eine AuthorizationPolicy mit komplett leerer Spec ({}) wurde auf den Namespace prod angewandt. Was ist der Effekt?

## Options

- Loggt nur, ohne zu blockieren
- Ein Validierungsfehler
- Erlaubt alles (leere Spec = keine Einschränkung)
- VERWEIGERT allen Traffic im Namespace

## Solution

**VERWEIGERT allen Traffic im Namespace** ist die richtige Antwort: Grausame Inversion: Eine ALLOW-Policy, die nichts matcht = nichts ist erlaubt (Istios Default-Deny-Semantik). Es ist sogar der idiomatische Weg für Deny-All. Vergleiche NetworkPolicy `ingress: [{}]` (erlaubt alles) — die "Leeren" haben entgegengesetzte Semantik!

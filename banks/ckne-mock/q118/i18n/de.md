## Question

Welches Manifest isoliert alle Pods eines Namespace vollständig (kein Ingress UND kein Egress erlaubt)?

## Options

- Alle Services löschen
- Nur policyTypes: [Ingress] mit podSelector: {}
- podSelector: {} mit policyTypes: [Ingress, Egress] und ohne Regeln
- podSelector: {} mit deklariertem ingress: [{}] und egress: [{}]

## Solution

**podSelector: {} mit policyTypes: [Ingress, Egress] und ohne Regeln** ist die richtige Antwort: Alles selektieren und beide policyTypes ohne Regeln deklarieren = totales Default-Deny. Die Variante mit `[{}]` erlaubt alles (eine leere Regel matcht jede Quelle/jedes Ziel) — die klassische Prüfungsfalle. Danach wird jeder Zugriff per Zusatz-Policy gewährt.

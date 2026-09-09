## Question

Eine INGRESS-Policy erlaubt Traffic zum Pod auf Port 8080, aber es gibt KEINE Egress-Policy für die Antworten. Funktionieren Verbindungen?

## Options

- Nur für 30 Sekunden
- Nein, die Antwort muss im Egress erlaubt sein
- Ja: Das Enforcement ist stateful
- Nur mit UDP

## Solution

**Ja: Das Enforcement ist stateful** ist die richtige Antwort: NetworkPolicies wirken auf Verbindungen (Conntrack), nicht Paket für Paket: Die initiierende Richtung zu erlauben genügt — Antwortpakete erlaubter Verbindungen passieren automatisch. Die Verwechslung mit stateless ACLs führt zu redundanten "Antwort"-Policies.

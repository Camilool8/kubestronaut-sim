## Question

Das Gateway liegt im Namespace "infra", das TLS-Secret in "apps". Der Listener referenziert das Secret, der Status zeigt RefNotPermitted. Was fehlt?

## Options

- Das Gateway nach kube-system verschieben
- Das Secret als public annotieren
- Ein ReferenceGrant in "apps", der Gateways aus "infra" erlaubt
- Das Secret manuell in den Namespace infra kopieren

## Solution

**Ein ReferenceGrant in "apps", der Gateways aus "infra" erlaubt** ist die richtige Antwort: Cross-Namespace-Referenzen auf Secrets erfordern die explizite Zustimmung des Secret-Besitzers: ein `ReferenceGrant` in "apps" mit from (Gateway/infra) und to (Secret). Ohne ihn verweigert die Gateway API — Schutz vor Zertifikats-Exfiltration.

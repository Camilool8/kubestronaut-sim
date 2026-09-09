## Question

Was bewirkt im CoreDNS-Corefile die Zeile `cache 30` im Server-Block?

## Options

- Antwort-Cache für bis zu 30 s, entlastet die Upstreams
- Limitiert jeden Pod auf 30 Queries
- Erhöht die TTL aller Records auf 30 Minuten
- Erzeugt 30 CoreDNS-Replikas

## Solution

**Antwort-Cache für bis zu 30 s, entlastet die Upstreams** ist die richtige Antwort: Das `cache`-Plugin speichert Antworten (Erfolg und Denial) bis zur angegebenen Zeit und respektiert niedrigere TTLs. Einer der wirksamsten DNS-Performance-Hebel, neben ausreichend CoreDNS-Replikas.

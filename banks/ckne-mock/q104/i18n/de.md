## Question

Wie erlauben Sie einen PORT-BEREICH (z. B. 30000 bis 32767) in einer einzigen NetworkPolicy-Regel?

## Options

- NetworkPolicy unterstützt keine Bereiche
- Das Protokoll RANGE verwenden
- Alle 2768 Ports einzeln in mehreren Regeln auflisten
- port: 30000 mit endPort: 32767 im selben Eintrag

## Solution

**port: 30000 mit endPort: 32767 im selben Eintrag** ist die richtige Antwort: Das Feld `endPort` definiert das Ende des bei `port` begonnenen Bereichs (numerischer, kein benannter Port). Stabil seit Kubernetes 1.25.

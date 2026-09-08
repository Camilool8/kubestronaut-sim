## Question

Ist bei aktivierter Node-zu-Node-WireGuard-Verschlüsselung im CNI der Traffic zwischen zwei Pods auf DEMSELBEN Node verschlüsselt?

## Options

- Nein: Die Verschlüsselung deckt Traffic ZWISCHEN Nodes ab
- Ja, immer
- Nur für UDP
- Nur wenn die Pods in verschiedenen Namespaces sind

## Solution

**Nein: Die Verschlüsselung deckt Traffic ZWISCHEN Nodes ab** ist die richtige Antwort: Ziel ist der Schutz des Drahts gegen Abhören im Netz. Pakete zwischen Same-Node-Pods laufen nur durch lokalen Speicher/Bridge und nie durch den Tunnel. Soll JEDER logische Hop verschlüsselt und authentifiziert sein: mit Mesh-mTLS kombinieren.

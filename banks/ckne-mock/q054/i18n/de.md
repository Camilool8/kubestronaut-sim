## Question

Wozu dient in einer CNI-.conflist-Datei das "plugins"-Array mit mehreren Einträgen (z. B. cilium, portmap, bandwidth)?

## Options

- Plugin-Auswahl je nach Pod-Namespace
- Jedes Plugin läuft auf einem anderen Node
- Alternative Plugins, nur genutzt wenn das erste versagt
- Chaining: Die Plugins laufen nacheinander

## Solution

**Chaining: Die Plugins laufen nacheinander** ist die richtige Antwort: CNI-Chaining führt Plugins der Reihe nach aus: Das erste (Main) erstellt und konfiguriert das Interface; verkettete erhalten das prevResult und ergänzen Fähigkeiten wie `portmap` (hostPort) und `bandwidth` (kubernetes.io/ingress-bandwidth-Annotations).

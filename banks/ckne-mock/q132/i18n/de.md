## Question

Das CNI nutzt MTU 1450 an Pod-Interfaces, das physische Netz kann Jumbo Frames (9000). Welche Einstellung holt mit VXLAN die maximale Performance heraus?

## Options

- VXLAN deaktivieren
- MTU 65535 in den Pods
- Physische MTU auf 9000 heben und Pods auf 8950 setzen
- Bei 1450 bleiben — mit jedem VXLAN verpflichtend

## Solution

**Physische MTU auf 9000 heben und Pods auf 8950 setzen** ist die richtige Antwort: Das Pod-Limit ist immer physische MTU − Overhead (~50 bei VXLAN). Mit Ende-zu-Ende-Jumbo-Frames vervielfacht 8950 den Durchsatz datenintensiver Workloads. Der übliche Fehler: nur eine Seite erhöhen.

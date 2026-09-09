## Question

Die "Golden Signals" aufs Cluster-Netzwerk angewandt — welches Metrik-Set entspricht Latenz, Traffic, Fehlern und Sättigung?

## Options

- Replikas, Nodes, Namespaces und installierte CRDs im Cluster
- Latenz, Bytes/s, 5xx-/Retrans-Fehler und Conntrack-Sättigung
- Commits, Builds, Deploys und Rollbacks pro Tag
- CPU, Speicher, Disk und Uptime der Worker-Nodes

## Solution

**Latenz, Bytes/s, 5xx-/Retrans-Fehler und Conntrack-Sättigung** ist die richtige Antwort: Die vier Signale mappen direkt: p99-Latenz, Durchsatz (Bytes/pps), Fehlerrate (Retrans/Resets/Drops/5xx) und Sättigung (Conntrack entries/limit, Qdisc-Drops, Bandbreite). Alerts darauf decken die meisten Netz-Degradierungen ab.

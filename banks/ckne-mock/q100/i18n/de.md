## Question

Was versucht Topology Aware Routing (Topology Hints, z. B. service.kubernetes.io/topology-mode: Auto) zu optimieren, und was ist der Trade-off?

## Options

- Allen Traffic verschlüsseln; Trade-off ist CPU-Last
- Traffic in derselben Availability Zone halten
- DNS-Lookups reduzieren; Trade-off ist Cache
- Replikas erhöhen; Trade-off ist Speicher

## Solution

**Traffic in derselben Availability Zone halten** ist die richtige Antwort: Mit Hints bevorzugt jeder kube-proxy Endpoints derselben Zone — spart Cross-AZ-Gebühren und Latenz. Der Trade-off: mögliche Unwucht, wenn Endpoints ungleich über Zonen verteilt sind; bei starker Asymmetrie deaktiviert der Mechanismus die Hints.

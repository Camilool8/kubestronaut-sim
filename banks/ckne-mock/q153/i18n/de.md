## Question

In einem Istio-Multi-Cluster-Mesh (multi-primary) vertrauen Workloads aus Cluster A den Zertifikaten aus Cluster B nicht (TLS-Fehler). Welche Identitätsanforderung wurde vergessen?

## Options

- Dieselbe Root-CA / Trust Domain teilen
- Denselben Namespace in beiden nutzen
- mTLS zwischen den Clustern vorübergehend abschalten
- Allen Mesh-Pods öffentliche IPs zuweisen

## Solution

**Dieselbe Root-CA / Trust Domain teilen** ist die richtige Antwort: Föderierte Identität verlangt eine gemeinsame Wurzel: Jeder Cluster mit eigener selbstgenerierter CA = zwei Vertrauensinseln. Intermediates aus derselben Root ausstellen (oder SPIRE-Föderation), bevor die Meshes verbunden werden.

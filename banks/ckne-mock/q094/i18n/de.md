## Question

Wie machen Sie in Cilium Cluster Mesh einen Service in allen verbundenen Clustern verfügbar und balanciert?

## Options

- Gleicher Name/Namespace + Annotation service.cilium.io/global
- Per NodePort auf allen Nodes exponieren
- Den ClusterIP manuell kopieren
- Nur über einen zwischen den Clustern geteilten Ingress

## Solution

**Gleicher Name/Namespace + Annotation service.cilium.io/global** ist die richtige Antwort: Mit der global-Annotation ("true") mergt Cilium die Backends aller Cluster ins Balancing. Extras: `service.cilium.io/affinity: local` bevorzugt lokale Endpoints, mit automatischem Failover auf entfernte.

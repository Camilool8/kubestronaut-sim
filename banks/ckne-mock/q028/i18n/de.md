## Question

Welche API standardisiert Service-Discovery über mehrere Cluster (Multi-Cluster Services), und welche DNS-Domain nutzt sie?

## Options

- ExternalDNS, mit external.local
- ClusterFederation v1, mit federated.local
- ServiceExport/ServiceImport
- Geteilter NodePort, mit nodes.local

## Solution

**ServiceExport/ServiceImport** ist die richtige Antwort: In der MCS API erzeugt der Export eines Service per `ServiceExport` in den anderen Clustern einen `ServiceImport`, auflösbar als `svc.ns.svc.clusterset.local`. Implementierungen: Cilium Cluster Mesh, Submariner, GKE MCS.

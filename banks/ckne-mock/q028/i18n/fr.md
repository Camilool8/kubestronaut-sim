## Question

Quelle API standardise la découverte de services multi-clusters (Multi-Cluster Services), et quel domaine DNS utilise-t-elle ?

## Options

- ExternalDNS, avec external.local
- ClusterFederation v1, avec federated.local
- ServiceExport/ServiceImport
- NodePort partagé, avec nodes.local

## Solution

**ServiceExport/ServiceImport** est la bonne réponse : Dans la MCS API, exporter un Service via `ServiceExport` crée un `ServiceImport` dans les autres clusters, résoluble en `svc.ns.svc.clusterset.local`. Implémentations : Cilium Cluster Mesh, Submariner, GKE MCS.

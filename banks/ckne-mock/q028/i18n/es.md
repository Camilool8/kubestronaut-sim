## Question

¿Qué API estandariza el descubrimiento de servicios entre varios clusters (Multi-Cluster Services) y qué dominio DNS utiliza?

## Options

- ExternalDNS, con external.local
- ClusterFederation v1, con federated.local
- ServiceExport/ServiceImport
- NodePort compartido, con nodes.local

## Solution

**ServiceExport/ServiceImport** es la respuesta correcta: En la API MCS, exportar un Service mediante `ServiceExport` crea un `ServiceImport` en los demás clusters, resoluble como `svc.ns.svc.clusterset.local`. Implementaciones: Cilium Cluster Mesh, Submariner y GKE MCS.

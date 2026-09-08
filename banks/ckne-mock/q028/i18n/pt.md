## Question

Qual API padroniza descoberta de serviços entre múltiplos clusters (Multi-Cluster Services), e qual domínio DNS ela usa?

## Options

- ExternalDNS, com external.local
- ClusterFederation v1, com federated.local
- ServiceExport/ServiceImport
- NodePort compartilhado, com nodes.local

## Solution

**ServiceExport/ServiceImport** é a resposta correta: Na MCS API, exportar um Service com `ServiceExport` gera `ServiceImport` nos demais clusters, resolvível como `svc.ns.svc.clusterset.local`. Implementações: Cilium Cluster Mesh, Submariner, GKE MCS.

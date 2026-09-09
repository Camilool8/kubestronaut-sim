## Question

Какой API стандартизирует обнаружение сервисов между несколькими кластерами (Multi-Cluster Services) и какой DNS-домен он использует?

## Options

- ExternalDNS с external.local
- ClusterFederation v1 с federated.local
- ServiceExport/ServiceImport
- Общий NodePort с nodes.local

## Solution

**ServiceExport/ServiceImport** — правильный ответ: В MCS API экспорт Service через `ServiceExport` создаёт `ServiceImport` в других кластерах; имя разрешается как `svc.ns.svc.clusterset.local`. Реализации: Cilium Cluster Mesh, Submariner, GKE MCS.

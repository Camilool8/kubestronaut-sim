## Question

Что требуется настроить для dual-stack кластера IPv4 + IPv6?

## Options

- Только заменить CNI
- Kubernetes не поддерживает dual-stack
- Только добавить AAAA-записи в CoreDNS
- Задать cluster-cidr и service-cluster-ip-range двумя блоками

## Solution

**Задать cluster-cidr и service-cluster-ip-range двумя блоками** — правильный ответ: Dual-stack требует двух CIDRs в control plane, совместимого CNI и полей `ipFamilyPolicy` (SingleStack, PreferDualStack, RequireDualStack) и `ipFamilies` для каждого Service. Pods получают IP каждой family в `status.podIPs`.

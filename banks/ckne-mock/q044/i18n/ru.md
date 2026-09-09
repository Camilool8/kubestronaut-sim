## Question

Каковы два реальных ограничения нативных Kubernetes NetworkPolicies?

## Options

- Они не умеют фильтровать по hostname/L7
- Они применяются только к namespace kube-system
- При каждом изменении требуется перезапуск pods
- Они не работают с TCP

## Solution

**Они не умеют фильтровать по hostname/L7** — правильный ответ: Нативный API ограничен L3/L4: нет rules по FQDN, HTTP methods, явного deny, priority или logging. CNI расширяют это: `toFQDNs` и HTTP rules в Cilium, `action: Deny/Log` в Calico. Policies применяются без перезапуска pods.

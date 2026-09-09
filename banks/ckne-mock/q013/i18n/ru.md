## Question

Что означает «kube-proxy replacement» в CNI, таких как Cilium?

## Options

- Передача разрешения Services в CoreDNS через специальный plugin
- Запуск двух экземпляров kube-proxy на каждом узле
- Замена логики Services программами eBPF без kube-proxy
- Использование HTTP proxy вместо kube-proxy

## Solution

**Замена логики Services программами eBPF без kube-proxy** — правильный ответ: Cilium реализует ClusterIP/NodePort/LoadBalancer через eBPF (socket-level LB и XDP), устраняя kube-proxy и chains iptables, что снижает задержку и улучшает масштабируемость. Проверьте командой `cilium status | grep KubeProxyReplacement`.

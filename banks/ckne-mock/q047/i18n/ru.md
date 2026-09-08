## Question

Какой инструмент экосистемы Cilium предоставляет видимость сетевых потоков L3–L7, включая verdicts policies FORWARDED/DROPPED?

## Options

- etcdctl watch /network
- CriticTool
- kubectl top pods --network
- Hubble (observe, UI, metrics)

## Solution

**Hubble (observe, UI, metrics)** — правильный ответ: `Hubble` читает события eBPF datapath: `hubble observe --verdict DROPPED` показывает, какой flow был заблокирован и какой policy. Он также экспортирует метрики flow/DNS/HTTP в Prometheus.

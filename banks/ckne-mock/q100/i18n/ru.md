## Question

Что пытается оптимизировать Topology Aware Routing с topology hints, например service.kubernetes.io/topology-mode: Auto, и каков компромисс?

## Options

- Шифровать весь трафик ценой CPU
- Сохранять трафик внутри той же availability zone
- Сокращать DNS-запросы ценой cache
- Увеличивать replicas ценой памяти

## Solution

**Сохранять трафик внутри той же availability zone** — правильный ответ: Hints заставляют каждый kube-proxy предпочитать endpoints той же zone, уменьшая стоимость cross-AZ трафика и задержку. Если в zone слишком мало endpoints относительно её доли трафика, возможна локальная перегрузка; при сильной асимметрии механизм отключает hints.

## Question

Как сделать Service доступным и сбалансированным во всех соединённых кластерах Cilium Cluster Mesh?

## Options

- Одинаковые name/namespace + annotation service.cilium.io/global
- Опубликовать через NodePort на всех узлах
- Вручную скопировать ClusterIP
- Только через общий для кластеров Ingress

## Solution

**Одинаковые name/namespace + annotation service.cilium.io/global** — правильный ответ: С global annotation Cilium объединяет backends всех кластеров в балансировку. Дополнительно `service.cilium.io/affinity: local` предпочитает endpoints локального кластера и автоматически переключается на удалённые при отказе локальных.

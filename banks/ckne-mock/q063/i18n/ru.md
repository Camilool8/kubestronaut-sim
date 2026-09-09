## Question

Какая комбинация предоставляет pod высокопроизводительный вторичный интерфейс с почти прямым доступом к физической NIC для NFV/низкой задержки?

## Options

- Два экземпляра kube-proxy
- Увеличение CPU requests
- hostPort + NodePort на одном физическом порту
- Multus + SR-IOV CNI + device plugin, передающие VFs NIC непосредственно pod

## Solution

**Multus + SR-IOV CNI + device plugin, передающие VFs NIC непосредственно pod** — правильный ответ: SR-IOV делит физическую NIC на Virtual Functions (VFs), которые передаются pod напрямую в обход network stack хоста; device plugin управляет распределением, а Multus подключает интерфейс. Это стандарт для telco/NFV и workloads с низкой задержкой.

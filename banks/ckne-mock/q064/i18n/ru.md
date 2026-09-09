## Question

Новый узел остаётся NotReady с condition «container runtime network not ready: cni plugin not initialized». Что проверить?

## Options

- Выполнена ли compaction etcd и нет ли alarms по месту
- Есть ли на узле GPU
- Работает ли DaemonSet CNI на узле и существует ли config в /etc/cni/net.d/
- Работает ли kube-scheduler на узле

## Solution

**Работает ли DaemonSet CNI на узле и существует ли config в /etc/cni/net.d/** — правильный ответ: Condition означает, что kubelet не нашёл работающий CNI. Обычно pod CNI из DaemonSet не запустился на узле из-за taints/image pull либо не записал config. Без CNI могут работать только pods с hostNetwork.

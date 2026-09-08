## Question

Pods застряли в ContainerCreating с ошибкой «failed to allocate for range 0: no IP addresses available in range». Каковы диагноз и исправление?

## Options

- DNS кластера недоступен
- Pool IPAM узла исчерпан
- У kubelet закончилась память
- apiserver ограничивает requests

## Solution

**Pool IPAM узла исчерпан** — правильный ответ: Каждый узел имеет конечный диапазон: podCIDR /24 по умолчанию даёт примерно 254 IP при max-pods 110. Crashes могут оставить orphaned leases в состоянии IPAM, например `/var/lib/cni/networks/<net>`. Удалите файлы IP без соответствующего container или увеличьте диапазон.

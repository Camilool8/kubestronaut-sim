## Question

Команда `dig app.default.svc.cluster.local` работает внутри pod, но `dig app` завершается ошибкой. Что следует проверить в первую очередь?

## Options

- Версию ядра узла
- Записи search и ndots в /etc/resolv.conf pod
- Включён ли hostNetwork в spec pod
- Работает ли kube-proxy в режиме IPVS или iptables

## Solution

**Записи search и ndots в /etc/resolv.conf pod** — правильный ответ: Короткие имена зависят от доменов `search`, например `default.svc.cluster.local svc.cluster.local`, и от `ndots:5`. Если dnsPolicy/dnsConfig были изменены или pod находится в другом namespace, короткое имя не разворачивается в правильный FQDN.

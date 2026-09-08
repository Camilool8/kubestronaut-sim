## Question

Pod находится в состоянии Running, но не получает трафик от Service. `kubectl get endpointslices` показывает endpoint с ready: false. Какова наиболее вероятная причина?

## Options

- CoreDNS постоянно перезапускается
- kube-proxy работает только с pods, у которых ready: true указано в manifest
- readinessProbe pod завершается неудачно, поэтому pod исключён из балансировки
- Истёк срок действия ClusterIP

## Solution

**readinessProbe pod завершается неудачно, поэтому pod исключён из балансировки** — правильный ответ: `readinessProbe` управляет доступностью endpoint: пока проверка не проходит, pod остаётся not-ready в EndpointSlice и не получает трафик. Это основной механизм «Pod Endpoint Availability». Проверьте события командой `kubectl describe pod`.

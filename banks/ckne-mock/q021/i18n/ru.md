## Question

kubectl get svc показывает Service, но `kubectl get endpointslices -l kubernetes.io/service-name=my-svc` не возвращает endpoints. Какова наиболее частая причина?

## Options

- ClusterIP уже используется другим Service
- Требуется перезапустить CoreDNS
- Selector Service не соответствует labels pod
- У Service отсутствует annotation endpoints

## Solution

**Selector Service не соответствует labels pod** — правильный ответ: Service без endpoints почти всегда означает несоответствие между `spec.selector` и labels pods, либо pods находятся в другом namespace, либо ни один не готов. Сравните с выводом `kubectl get pods --show-labels`.

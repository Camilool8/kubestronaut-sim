## Question

Как заставить Service кластера балансировать на ВНЕШНИЙ backend с фиксированными IP, например legacy database 192.168.10.5:5432, сохранив внутреннее DNS-имя?

## Options

- Service без selector + вручную созданный EndpointSlice с внешними IP
- Установить базу данных в кластере как StatefulSet
- Это невозможно без переписывания kube-proxy
- Использовать hostNetwork

## Solution

**Service без selector + вручную созданный EndpointSlice с внешними IP** — правильный ответ: Service без `selector` не создаёт endpoints автоматически; вручную создайте `EndpointSlice` с label kubernetes.io/service-name и внешними IP. В отличие от ExternalName/CNAME здесь есть реальный VIP и балансировка.

## Question

Как с помощью Gateway API реализовать canary release, направляя 10 % трафика на новую версию?

## Options

- Создать 10 replicas старой версии и 1 новой
- Задать sessionAffinity: Canary у Service
- Два backendRefs в HTTPRoute с weights 90 и 10
- Использовать два Gateways с одинаковым hostname

## Solution

**Два backendRefs в HTTPRoute с weights 90 и 10** — правильный ответ: HTTPRoute поддерживает встроенное разделение трафика: несколько `backendRefs` с weights. Canary также можно маршрутизировать по header/cookie через `matches.headers` в отдельном rule.

## Question

Что делает Service типа ExternalName?

## Options

- Создаёт NodePort с пользовательским именем
- Для работы требует LoadBalancer, созданный cloud provider
- Возвращает CNAME на внешнее DNS-имя без proxy и endpoints
- Назначает pod фиксированный внешний IP

## Solution

**Возвращает CNAME на внешнее DNS-имя без proxy и endpoints** — правильный ответ: `ExternalName` работает исключительно через DNS: запросы возвращают CNAME на `spec.externalName`. Нет VIP, kube-proxy и балансировки; это удобно для представления внешних сервисов внутренними именами.

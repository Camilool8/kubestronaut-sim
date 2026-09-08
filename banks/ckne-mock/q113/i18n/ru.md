## Question

Какие основные поля составляют ресурс Certificate в cert-manager?

## Options

- key, cert и ca открытым текстом
- host, path и backend
- secretName, dnsNames и issuerRef
- image, replicas и ports

## Solution

**secretName, dnsNames и issuerRef** — правильный ответ: Certificate описывает desired state; cert-manager выпускает сертификат через `issuerRef`, записывает key+cert в Secret `secretName` и автоматически обновляет. Gateway/Ingress затем просто ссылается на этот Secret.

## Question

Service типа ExternalName указывает на api.partner.com, а клиенты вызывают https://my-alias.default.svc.cluster.local. TLS завершается ошибкой. Почему?

## Options

- CoreDNS блокирует TLS
- ExternalName не поддерживает HTTPS или TLS passthrough
- Не хватает NodePort на порту 443
- Сертификат целевого сервера выпущен для api.partner.com, поэтому возникает несовпадение SAN

## Solution

**Сертификат целевого сервера выпущен для api.partner.com, поэтому возникает несовпадение SAN** — правильный ответ: Проверка TLS использует имя, которое запросил КЛИЕНТ. Исправление: обращаться к реальному имени, правильно настраивать SNI/проверку сертификата либо использовать proxy, который переписывает Host и SNI.

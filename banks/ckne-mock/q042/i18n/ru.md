## Question

Когда следует использовать TLS Passthrough (TLSRoute) вместо Terminate на Gateway?

## Options

- Когда backend должен самостоятельно завершать TLS
- Когда у backend нет сертификата
- Passthrough предназначен только для UDP
- Всегда, потому что это быстрее

## Solution

**Когда backend должен самостоятельно завершать TLS** — правильный ответ: В режиме `Passthrough` Gateway читает только SNI из ClientHello и передаёт зашифрованные bytes. Маршрутизация по path/header теряется из-за отсутствия видимости L7, но сертификат остаётся под контролем backend.

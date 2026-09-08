## Question

Какой ресурс Gateway API маршрутизирует TLS-соединения по SNI БЕЗ расшифровки и с каким режимом listener он связан?

## Options

- TCPRoute с включённым полем tls: true
- HTTPRoute в режиме Secure
- CertRoute с автоматическим SNI
- TLSRoute на TLS listener в режиме Passthrough

## Solution

**TLSRoute на TLS listener в режиме Passthrough** — правильный ответ: `TLSRoute` сопоставляет SNI в ClientHello и передаёт зашифрованный stream неизменным backend, который завершает TLS. Это позволяет публиковать несколько end-to-end TLS services через один IP.

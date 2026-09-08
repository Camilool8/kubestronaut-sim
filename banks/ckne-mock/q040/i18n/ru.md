## Question

Как в Gateway API настроить завершение TLS на HTTPS listener?

## Options

- Смонтировать сертификат как hostPath в каждом kube-proxy
- Через annotation tls=true у Service
- В listener Gateway с tls.mode: Terminate и certificateRefs
- В HTTPRoute через поле spec.tls.cert

## Solution

**В listener Gateway с tls.mode: Terminate и certificateRefs** — правильный ответ: Listener объявляет `protocol: HTTPS`, `tls.mode: Terminate` и `certificateRefs` на Secrets типа `kubernetes.io/tls`. Для Secret в другом namespace требуется `ReferenceGrant`.

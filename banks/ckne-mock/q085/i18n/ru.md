## Question

HTTPRoute должен ссылаться через backendRefs на Service в ДРУГОМ namespace. Что требуется?

## Options

- Пересоздать Service как NodePort
- ReferenceGrant в namespace Service, разрешающий этот route
- Ничего; cross-namespace references разрешены по умолчанию
- Поместить Gateway в kube-system

## Solution

**ReferenceGrant в namespace Service, разрешающий этот route** — правильный ответ: Cross-namespace references по умолчанию запрещены для защиты от перехвата трафика. Владелец destination namespace публикует `ReferenceGrant` с from (kind/namespace) и to (kind/name); только после этого route разрешает ссылку.

## Question

Gateway находится в namespace «infra», а TLS Secret — в «apps». Listener ссылается на Secret, но status показывает RefNotPermitted. Чего не хватает?

## Options

- Поместить Gateway в kube-system
- Пометить Secret как public
- ReferenceGrant в «apps», разрешающего Gateways из «infra»
- Вручную скопировать Secret в namespace infra

## Solution

**ReferenceGrant в «apps», разрешающего Gateways из «infra»** — правильный ответ: Cross-namespace ссылка на Secret требует явного согласия владельца Secret: `ReferenceGrant` в apps с from (Gateway/infra) и to (Secret). Без него Gateway API отклоняет ссылку для предотвращения кражи сертификата.

## Question

HTTPRoute находится в namespace, отличном от Gateway, и не работает. Что обычно требуется изменить?

## Options

- Поле listeners.allowedRoutes.namespaces у Gateway
- Backend Service должен иметь тип NodePort
- HTTPRoutes работают только в namespace Gateway без исключений
- HTTPRoute требуется hostNetwork

## Solution

**Поле listeners.allowedRoutes.namespaces у Gateway** — правильный ответ: По умолчанию `allowedRoutes.namespaces.from` равно `Same`. Чтобы принимать routes из других namespaces, у listener задайте `from: All` или `from: Selector`. Для backends в других namespaces также требуется `ReferenceGrant`.

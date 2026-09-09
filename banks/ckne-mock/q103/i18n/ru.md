## Question

Как стандартно разрешить в NetworkPolicy трафик из конкретного namespace по ИМЕНИ, например «monitoring»?

## Options

- ipBlock с CIDR namespace
- Указать literal name в поле from.namespace
- namespaceSelector с label kubernetes.io/metadata.name
- Выбирать по имени невозможно

## Solution

**namespaceSelector с label kubernetes.io/metadata.name** — правильный ответ: Каждый namespace автоматически получает неизменяемый label `kubernetes.io/metadata.name`. Использование его в namespaceSelector позволяет ссылаться на namespaces по имени без ручных labels.

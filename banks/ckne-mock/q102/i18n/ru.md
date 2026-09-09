## Question

Может ли NetworkPolicy, созданная в namespace «prod», выбрать и изолировать pods в namespace «dev»?

## Options

- Только если CNI — Calico
- Да, с annotation cross-namespace
- Нет: NetworkPolicy является namespaced-ресурсом
- Да, если использует namespaceSelector

## Solution

**Нет: NetworkPolicy является namespaced-ресурсом** — правильный ответ: `spec.podSelector` выбирает targets ТОЛЬКО в namespace самой policy. `namespaceSelector` используется только в rules from/to для определения разрешённых источников/назначений, но не для выбора изолируемых pods. Для cluster scope применяются AdminNetworkPolicy или CRDs CNI.

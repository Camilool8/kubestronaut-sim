## Question

В правиле from чем отличается namespaceSelector: {} от отсутствия namespaceSelector?

## Options

- Пустой namespaceSelector: {} выбирает ВСЕ namespaces кластера
- Пустой selector не выбирает ни одного namespace
- Пустой selector недопустим
- Ничем

## Solution

**Пустой namespaceSelector: {} выбирает ВСЕ namespaces кластера** — правильный ответ: В Kubernetes пустой selector означает «выбрать всё». Поэтому `namespaceSelector: {}` открывает доступ из всего кластера — противоположно интуиции «пусто значит ничего».

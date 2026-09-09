## Question

Каково назначение массива «plugins» с несколькими элементами, например cilium, portmap, bandwidth, в файле CNI .conflist?

## Options

- Выбирать plugin по namespace pod
- Запускать каждый plugin на отдельном узле
- Определить альтернативные plugins, используемые только при отказе первого
- Chaining: plugins выполняются последовательно

## Solution

**Chaining: plugins выполняются последовательно** — правильный ответ: CNI chaining запускает plugins по порядку: первый, основной, создаёт и настраивает интерфейс; chained plugins получают предыдущий результат (prevResult) и добавляют возможности, например `portmap` для hostPort и `bandwidth` для annotations kubernetes.io/ingress-bandwidth.

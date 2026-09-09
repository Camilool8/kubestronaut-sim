## Question

В MCS API чем ServiceImport типа ClusterSetIP отличается от типа Headless?

## Options

- ClusterSetIP предоставляет единый VIP с балансировкой между кластерами
- Разницы нет
- ClusterSetIP поддерживает только IPv4, а Headless — только IPv6
- Headless всегда быстрее ClusterSetIP

## Solution

**ClusterSetIP предоставляет единый VIP с балансировкой между кластерами** — правильный ответ: Поведение аналогично одному кластеру: `ClusterSetIP` предоставляет VIP для сбалансированного доступа; `Headless` публикует каждый backend отдельными records, что требуется, когда клиент должен обращаться к конкретным instances между кластерами.

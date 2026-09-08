## Question

Как в Inference Extension HTTPRoute направляет трафик в InferencePool вместо Service?

## Options

- backendRefs ссылается на InferencePool через group/kind
- Через annotation inference=true
- Заменой Gateway на DaemonSet
- Это невозможно: backendRefs принимает только Service

## Solution

**backendRefs ссылается на InferencePool через group/kind** — правильный ответ: Поле `backendRefs` расширяемо через group/kind. Когда оно указывает на InferencePool, окончательный выбор endpoint выполняет EPP с учётом очереди, KV-cache, LoRA и других метрик вместо классического балансирования.

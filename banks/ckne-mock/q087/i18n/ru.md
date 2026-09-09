## Question

Клиенты вызывают API в стиле OpenAI, где требуемая модель указана в JSON BODY ({"model": "llama-3"}). Почему это проблема для традиционных gateways и каково решение?

## Options

- Проблемы нет; gateways изначально читают JSON
- Переключить protocol на UDP
- Использовать NodePort
- Gateways маршрутизируют по path/header/SNI, а не по body

## Solution

**Gateways маршрутизируют по path/header/SNI, а не по body** — правильный ответ: Классическая маршрутизация не анализирует payload. Расширение Body-Based Routing, реализованное через Envoy ext-proc в Inference Gateway, разбирает JSON, переносит `model` в header, после чего обычная маршрутизация HTTPRoute/InferencePool выбирает назначение.

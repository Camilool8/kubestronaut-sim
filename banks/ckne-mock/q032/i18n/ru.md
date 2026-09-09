## Question

Streaming-запросы SSE от LLM за Gateway обрываются примерно через 30 секунд. Какое исправление правильное?

## Options

- Увеличить request/idle timeouts в Gateway/HTTPRoute
- Отключить TLS для уменьшения задержки handshake
- Уменьшить keepalive ядра
- Перевести Service на UDP, где нет timeouts

## Solution

**Увеличить request/idle timeouts в Gateway/HTTPRoute** — правильный ответ: Proxies применяют timeouts по умолчанию 30–60 секунд. Для streaming tokens нужно увеличить `timeouts.request`/`backendRequest` в HTTPRoute (GEP-1742) или эквивалентные параметры и отключить buffering для SSE.

## Question

Что такое LoRA-aware routing в inference gateways?

## Options

- Использование только GPU NVIDIA
- Направление запроса на replicas, где нужный LoRA adapter уже загружен
- Сжатие ответов
- Балансировка по hash prompt между всеми replicas

## Solution

**Направление запроса на replicas, где нужный LoRA adapter уже загружен** — правильный ответ: Servers, такие как vLLM, сообщают, какие LoRA adapters загружены. Endpoint Picker отдаёт приоритет replicas с уже прогретым adapter, поскольку замена adapters расходует GPU time и ухудшает задержку для всей очереди.

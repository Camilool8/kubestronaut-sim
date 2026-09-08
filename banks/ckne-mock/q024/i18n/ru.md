## Question

Какой официальный проект расширяет Gateway API для оптимизации маршрутизации трафика inference LLM в Kubernetes?

## Options

- Gateway API Inference Extension
- CNCF LLMProxy Operator
- режим MetalLB AI
- Kubeflow Pipelines Serving

## Solution

**Gateway API Inference Extension** — правильный ответ: `Gateway API Inference Extension` добавляет CRDs, такие как `InferencePool`, и Endpoint Picker, который маршрутизирует по метрикам model-server — длине очереди, использованию KV-cache, adapters LoRA — вместо слепого round-robin.

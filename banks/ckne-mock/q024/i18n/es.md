## Question

¿Qué proyecto oficial amplía Gateway API para optimizar el enrutamiento del tráfico de inferencia de LLM en Kubernetes?

## Options

- Gateway API Inference Extension
- el CNCF LLMProxy Operator
- MetalLB AI mode
- Kubeflow Pipelines Serving

## Solution

**Gateway API Inference Extension** es la respuesta correcta: `Gateway API Inference Extension` añade CRD como `InferencePool` y un Endpoint Picker que enruta según métricas del servidor de modelos, como profundidad de cola, utilización de KV-cache y adaptadores LoRA, en lugar de un round-robin ciego.

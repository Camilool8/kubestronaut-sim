## Question

Welches offizielle Projekt erweitert die Gateway API, um das Routing von LLM-Inferenz-Traffic auf Kubernetes zu optimieren?

## Options

- Gateway API Inference Extension
- der CNCF LLMProxy Operator
- MetalLB AI mode
- Kubeflow Pipelines Serving

## Solution

**Gateway API Inference Extension** ist die richtige Antwort: Die `Gateway API Inference Extension` ergänzt CRDs wie `InferencePool` und einen Endpoint Picker, der nach Modell-Server-Metriken routet — Queue-Tiefe, KV-Cache-Auslastung, LoRA-Adapter — statt blindem Round-Robin.

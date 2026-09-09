## Question

Qual projeto oficial estende o Gateway API para otimizar roteamento de tráfego de inferência de LLMs em Kubernetes?

## Options

- Gateway API Inference Extension
- LLMProxy Operator da CNCF
- MetalLB AI mode
- Kubeflow Pipelines Serving

## Solution

**Gateway API Inference Extension** é a resposta correta: A `Gateway API Inference Extension` adiciona CRDs como `InferencePool` e um Endpoint Picker que roteia considerando métricas do servidor de modelo — profundidade de fila, utilização de KV-cache, adaptadores LoRA — em vez de round-robin cego.

## Question

Na Inference Extension, como o HTTPRoute envia tráfego para um InferencePool em vez de um Service?

## Options

- backendRefs referencia o InferencePool por group/kind
- Via annotation inference=true
- Trocando o Gateway por um DaemonSet
- Impossível; backendRefs só aceita Service

## Solution

**backendRefs referencia o InferencePool por group/kind** é a resposta correta: `backendRefs` é extensível por group/kind. Apontando ao InferencePool, a decisão final de endpoint sai do balanceamento clássico e vai para o EPP (métricas de fila/KV-cache/LoRA).

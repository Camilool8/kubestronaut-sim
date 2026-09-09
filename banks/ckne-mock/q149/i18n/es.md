## Question

En Inference Extension, ¿cómo envía HTTPRoute el tráfico a un InferencePool en lugar de a un Service?

## Options

- backendRefs referencia InferencePool mediante group/kind
- Mediante una annotation inference=true
- Sustituyendo Gateway por un DaemonSet
- Es imposible; backendRefs solo acepta Service

## Solution

**backendRefs referencia InferencePool mediante group/kind** es la respuesta correcta: `backendRefs` es extensible mediante group/kind. Al apuntar a InferencePool, la decisión final del endpoint abandona el balanceo clásico y pasa al EPP (métricas de cola/KV-cache/LoRA).

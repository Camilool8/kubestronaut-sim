## Question

Wie schickt in der Inference Extension die HTTPRoute Traffic an einen InferencePool statt an einen Service?

## Options

- backendRefs referenziert den InferencePool per group/kind
- Per Annotation inference=true
- Das Gateway gegen ein DaemonSet tauschen
- Unmöglich; backendRefs akzeptiert nur Service

## Solution

**backendRefs referenziert den InferencePool per group/kind** ist die richtige Antwort: `backendRefs` ist per group/kind erweiterbar (inference.networking.x-k8s.io, kind: InferencePool). Zeigt es auf den Pool, wandert die finale Endpoint-Wahl vom klassischen Balancing zum EPP (Queue-/KV-Cache-/LoRA-Metriken).

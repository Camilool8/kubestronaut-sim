## Question

Dans l'Inference Extension, comment l'HTTPRoute envoie-t-elle le trafic vers un InferencePool au lieu d'un Service ?

## Options

- backendRefs référence l'InferencePool par group/kind
- Via une annotation inference=true
- En remplaçant le Gateway par un DaemonSet
- Impossible ; backendRefs n'accepte que Service

## Solution

**backendRefs référence l'InferencePool par group/kind** est la bonne réponse : `backendRefs` est extensible par group/kind (inference.networking.x-k8s.io, kind: InferencePool). En pointant le pool, la décision finale d'endpoint quitte le balancing classique pour l'EPP (métriques queue/KV-cache/LoRA).

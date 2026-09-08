## Question

Quel projet officiel étend la Gateway API pour optimiser le routage du trafic d'inférence LLM sur Kubernetes ?

## Options

- Gateway API Inference Extension
- le LLMProxy Operator de la CNCF
- MetalLB AI mode
- Kubeflow Pipelines Serving

## Solution

**Gateway API Inference Extension** est la bonne réponse : La `Gateway API Inference Extension` ajoute des CRD comme `InferencePool` et un Endpoint Picker qui route selon les métriques des serveurs de modèles — profondeur de queue, utilisation du KV-cache, adaptateurs LoRA — au lieu d'un round-robin aveugle.

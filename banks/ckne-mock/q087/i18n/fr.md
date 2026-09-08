## Question

Des clients appellent une API type OpenAI où le modèle voulu est dans le BODY JSON ({"model": "llama-3"}). Pourquoi est-ce un problème pour les gateways classiques, et quelle est la solution ?

## Options

- Ce n'est pas un problème ; les gateways lisent le JSON nativement
- Passer le protocole en UDP
- Utiliser NodePort
- Les gateways routent par path/header/SNI, pas par le body

## Solution

**Les gateways routent par path/header/SNI, pas par le body** est la bonne réponse : Le routage classique n'inspecte pas les payloads. L'extension Body-Based Routing (Envoy ext-proc dans l'Inference Gateway) parse le JSON, promeut `model` en header, et le routage HTTPRoute/InferencePool normal décide de la destination.

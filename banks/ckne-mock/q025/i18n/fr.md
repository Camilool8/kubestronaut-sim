## Question

Pourquoi le simple round-robin est-il mauvais pour le trafic LLM, exigeant des stratégies spécifiques ?

## Options

- Les requêtes ont un coût extrêmement variable
- Les GPU ne tiennent qu'une connexion TCP
- Les LLM n'utilisent pas HTTP
- kube-proxy bloque le trafic IA

## Solution

**Les requêtes ont un coût extrêmement variable** est la bonne réponse : Une requête génère 10 tokens, une autre 4 000 ; les réponses sont en streaming (SSE), longues et stateful (KV-cache). Les balancers « inference-aware » utilisent la pression queue/KV-cache par réplique et l'affinité de préfixe, plus des timeouts ajustés.

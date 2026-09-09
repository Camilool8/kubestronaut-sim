## Question

Pourquoi l'affinité par PRÉFIXE de prompt (prefix-cache aware) améliore-t-elle drastiquement la latence sur des serveurs LLM comme vLLM ?

## Options

- Elle réduit la taille des réponses
- Elle compresse le modèle avant chaque requête
- Elle évite le handshake TLS entre gateway et chaque réplique
- Elle réutilise le KV-cache du préfixe, évitant de refaire le prefill

## Solution

**Elle réutilise le KV-cache du préfixe, évitant de refaire le prefill** est la bonne réponse : Le prefill est la partie coûteuse. Si le préfixe (ex. long system prompt) est déjà dans le KV-cache d'une réplique, y envoyer la même conversation économise ce coût et réduit le TTFT. Un balancing « aveugle » disperse et gaspille le cache.

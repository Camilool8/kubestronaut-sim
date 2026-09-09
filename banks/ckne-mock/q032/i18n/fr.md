## Question

Les requêtes streaming (SSE) d'un LLM derrière un Gateway sont coupées après ~30 s. Quel est le bon correctif ?

## Options

- Augmenter les timeouts request/idle sur le Gateway/HTTPRoute
- Désactiver TLS pour réduire la latence du handshake
- Baisser le keepalive du kernel
- Passer le Service en UDP, qui n'a pas de timeouts

## Solution

**Augmenter les timeouts request/idle sur le Gateway/HTTPRoute** est la bonne réponse : Les proxies appliquent des timeouts par défaut (30–60 s). Le streaming de tokens exige d'augmenter `timeouts.request`/`backendRequest` sur l'HTTPRoute (GEP-1742) ou équivalent, et de garder le buffering désactivé pour le SSE.

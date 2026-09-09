## Question

Avant de promouvoir une nouvelle version, vous voulez lui envoyer une COPIE du trafic réel de production, sans que ses réponses touchent les clients. Quel filtre HTTPRoute ?

## Options

- requestMirror (shadow traffic)
- urlRewrite
- retryPolicy
- backendRefs avec poids 50/50

## Solution

**requestMirror (shadow traffic)** est la bonne réponse : `RequestMirror` implémente le shadowing : la production reste servie par le backend principal tandis que la nouvelle version reçoit un trafic identique pour valider erreurs/latence — sans risque utilisateur (contrairement au canary, qui sert de vraies réponses).

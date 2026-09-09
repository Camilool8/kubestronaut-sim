## Question

Quel filtre HTTPRoute permet d'ajouter un header (ex. X-Env: prod) à toutes les requêtes transmises au backend ?

## Options

- requestHeaderModifier
- corsPolicy
- urlRewrite
- requestMirror

## Solution

**requestHeaderModifier** est la bonne réponse : Le filtre `RequestHeaderModifier` (add/set/remove) agit sur le chemin requête (ResponseHeaderModifier pour la réponse). `URLRewrite` change hostname/path ; `RequestMirror` duplique le trafic vers un autre backend.

## Question

Une HTTPRoute a besoin de backendRefs vers un Service d'un AUTRE namespace. Que faut-il ?

## Options

- Recréer le Service en NodePort
- Un ReferenceGrant dans le namespace du Service, autorisant la route
- Rien, les références inter-namespaces sont autorisées par défaut
- Mettre le Gateway dans kube-system

## Solution

**Un ReferenceGrant dans le namespace du Service, autorisant la route** est la bonne réponse : Les références inter-namespaces sont refusées par défaut (protection contre le « détournement » de trafic). Le propriétaire du namespace cible publie un `ReferenceGrant` déclarant from (kind/namespace) et to (kind/name) — alors seulement la route se résout.

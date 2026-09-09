## Question

Une AuthorizationPolicy à la spec complètement vide ({}) a été appliquée au namespace prod. Quel est l'effet ?

## Options

- Elle ne fait que logger, sans bloquer
- Une erreur de validation
- Elle autorise tout (spec vide = aucune restriction)
- Elle REFUSE tout le trafic du namespace

## Solution

**Elle REFUSE tout le trafic du namespace** est la bonne réponse : Inversion cruelle : une policy ALLOW qui ne matche rien = rien n'est autorisé (sémantique default-deny d'Istio). C'est même la façon idiomatique de faire du deny-all. Comparez avec la NetworkPolicy `ingress: [{}]` (autorise tout) — les « vides » ont des sémantiques opposées !

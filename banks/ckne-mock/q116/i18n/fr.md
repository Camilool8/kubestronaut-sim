## Question

Au-delà de l'identité mTLS des workloads, comment valider les JWT des UTILISATEURS FINAUX sur les requêtes atteignant un service Istio ?

## Options

- RequestAuthentication + AuthorizationPolicy exigeant requestPrincipals
- NetworkPolicy native avec un champ jwt dédié
- Basic Auth dans une ConfigMap
- Validation uniquement dans le frontend, avant le gateway

## Solution

**RequestAuthentication + AuthorizationPolicy exigeant requestPrincipals** est la bonne réponse : `RequestAuthentication` définit comment valider le token (issuer, clés JWKS) ; seule, elle ne rejette que les tokens INVALIDES. C'est l'`AuthorizationPolicy` avec `requestPrincipals: ["*"]` qui exige un token valide — les deux couches (workload + utilisateur) se complètent.

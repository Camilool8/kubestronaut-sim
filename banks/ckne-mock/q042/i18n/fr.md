## Question

Quand utiliser le TLS Passthrough (TLSRoute) plutôt que Terminate au Gateway ?

## Options

- Quand le backend doit terminer le TLS lui-même
- Quand aucun certificat n'est disponible côté backend
- Le Passthrough ne sert que pour l'UDP
- Toujours, car c'est plus rapide

## Solution

**Quand le backend doit terminer le TLS lui-même** est la bonne réponse : En `Passthrough`, le Gateway ne lit que le SNI du ClientHello et transmet les octets chiffrés tels quels. On perd le routage par path/header (pas de visibilité L7), mais le certificat reste sous contrôle du backend — mTLS de bout en bout/conformité.

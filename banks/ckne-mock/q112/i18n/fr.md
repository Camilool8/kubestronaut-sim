## Question

Le Gateway est dans le namespace « infra » et le Secret TLS dans « apps ». Le listener référence le Secret mais le statut montre RefNotPermitted. Que manque-t-il ?

## Options

- Mettre le Gateway dans kube-system
- Annoter le Secret comme public
- Un ReferenceGrant dans « apps » autorisant les Gateways d'« infra »
- Copier le Secret à la main dans le namespace infra

## Solution

**Un ReferenceGrant dans « apps » autorisant les Gateways d'« infra »** est la bonne réponse : Les références inter-namespaces vers des Secrets exigent le consentement explicite du propriétaire : un `ReferenceGrant` dans « apps » avec from (Gateway/infra) et to (Secret). Sans lui, la Gateway API refuse — protection contre l'exfiltration de certificats.

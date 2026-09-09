## Question

Quel mécanisme fournit l'authentification mutuelle par workload (identité cryptographique par pod) avec mTLS automatique, typiquement via service mesh ?

## Options

- Basic Auth sur le kubelet
- Un mot de passe partagé distribué via ConfigMap
- Le plugin d'admission NodeRestriction de l'apiserver
- mTLS avec des identités SPIFFE/SVID émises automatiquement

## Solution

**mTLS avec des identités SPIFFE/SVID émises automatiquement** est la bonne réponse : Les meshes donnent à chaque workload une identité SPIFFE (ex. `spiffe://cluster/ns/sa/…`) dans des certificats X.509 de courte durée (SVIDs), établissant un mTLS automatique basé sur le ServiceAccount, pas l'IP.

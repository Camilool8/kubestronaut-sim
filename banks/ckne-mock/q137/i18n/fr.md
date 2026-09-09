## Question

Un Service ExternalName pointe vers api.partenaire.com et les clients appellent https://mon-alias.default.svc.cluster.local. Le TLS échoue. Pourquoi ?

## Options

- CoreDNS bloque le TLS
- Le type ExternalName ne supporte ni HTTPS ni TLS passthrough
- Il manque un NodePort pour exposer le 443
- Le certificat de la cible est pour api.partenaire.com (SAN mismatch)

## Solution

**Le certificat de la cible est pour api.partenaire.com (SAN mismatch)** est la bonne réponse : Piège TLS : la validation utilise le nom demandé par le CLIENT — le hostname interne ne correspond pas au certificat (SNI/SAN mismatch). Correctif : appeler le vrai nom, configurer SNI/vérification, ou un proxy qui réécrit Host/SNI.

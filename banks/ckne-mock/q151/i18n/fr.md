## Question

Deux clusters aux pod CIDRs IDENTIQUES (tous deux 10.244.0.0/16) doivent se connecter via Submariner. Possible ?

## Options

- Seulement si un cluster est en IPv6
- Non, jamais
- Oui, avec Globalnet : des CIDRs virtuels + NAT cross-cluster
- Oui, sans aucune configuration

## Solution

**Oui, avec Globalnet : des CIDRs virtuels + NAT cross-cluster** est la bonne réponse : Des CIDR chevauchants empêchent le routage direct (même réseau des deux côtés). Submariner Globalnet crée des globalCIDRs virtuels + NAT ingress/egress — la solution spécifique des brownfields aux plages répétées.

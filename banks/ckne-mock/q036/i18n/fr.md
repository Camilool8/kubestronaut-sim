## Question

Comment autoriser l'egress d'un pod uniquement vers 203.0.113.0/24, sauf l'hôte 203.0.113.9 ?

## Options

- Ajouter l'hôte en blackhole dans /etc/hosts
- ipBlock ne supporte pas les exceptions
- Deux policies séparées : une allow et une deny
- ipBlock avec cidr 203.0.113.0/24 et except 203.0.113.9/32

## Solution

**ipBlock avec cidr 203.0.113.0/24 et except 203.0.113.9/32** est la bonne réponse : `ipBlock` accepte un `cidr` et une liste `except`. Rappel : avec n'importe quelle policy egress, tout le reste est bloqué — y compris le DNS ; autorisez aussi le port 53 vers kube-dns.

## Question

Le dashboard montre une explosion de NXDOMAIN dans CoreDNS et l'équipe soupçonne une attaque. Les requêtes ressemblent à api.stripe.com.default.svc.cluster.local. Le bon diagnostic ?

## Options

- CoreDNS n'a plus de mémoire
- CoreDNS a été compromis
- Une attaque de DNS tunneling
- Comportement normal du ndots:5

## Solution

**Comportement normal du ndots:5** est la bonne réponse : Avant de crier « attaque », regardez le SUFFIXE des requêtes échouées : noms externes + search domains = expansion ndots avec des NXDOMAIN légitimes avant la bonne réponse. Optimisable par FQDN (point final) ou ndots plus bas.

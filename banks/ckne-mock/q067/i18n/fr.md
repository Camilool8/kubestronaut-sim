## Question

Entre deux pods, le ping (ICMP) passe, mais les connexions TCP sur 8080 échouent. Les deux causes les plus probables ?

## Options

- Une NetworkPolicy L4 restrictive, ou un problème MTU/PMTUD
- ICMP est désactivé dans le kernel des deux nœuds
- Le DNS est tombé dans le namespace du pod
- Le pod a besoin de privilèges root

## Solution

**Une NetworkPolicy L4 restrictive, ou un problème MTU/PMTUD** est la bonne réponse : Un petit ICMP traverse des chemins qui jettent les gros paquets (MTU), et les policies traitent les protocoles différemment. Testez avec `nc -zv`, comparez petits vs gros payloads (un `curl` de gros fichier pend-il ?) et revoyez les policies L4.

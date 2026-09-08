## Question

Avec un CNI en routage natif (sans encapsulation), qu'attendez-vous dans `ip route` sur le nœud ?

## Options

- Des routes vers les podCIDRs des autres nœuds via l'IP du nœud voisin
- Des routes /32 pour chaque pod du cluster entier
- Aucune route liée aux pods
- Seulement la route par défaut vers la gateway physique

## Solution

**Des routes vers les podCIDRs des autres nœuds via l'IP du nœud voisin** est la bonne réponse : En routage direct/natif, pas d'encapsulation : chaque nœud doit savoir que le podCIDR du voisin est joignable via son IP (ex. 10.244.2.0/24 via 192.168.1.12). Ces routes sont installées par le CNI ou apprises en BGP. Leur absence casse le trafic inter-nœuds.

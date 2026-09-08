## Question

Comment autoriser une PLAGE de ports (ex. 30000 à 32767) dans une seule règle de NetworkPolicy ?

## Options

- La NetworkPolicy ne supporte pas les plages
- Utiliser le protocole RANGE
- Lister les 2768 ports un par un dans plusieurs règles
- port: 30000 avec endPort: 32767 dans la même entrée

## Solution

**port: 30000 avec endPort: 32767 dans la même entrée** est la bonne réponse : Le champ `endPort` définit la fin de la plage commencée à `port` (port numérique, pas nommé). Stable depuis Kubernetes 1.25.

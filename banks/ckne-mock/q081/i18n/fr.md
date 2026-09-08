## Question

Que fait le champ internalTrafficPolicy: Local sur un Service ?

## Options

- Bloque tout le trafic venant de l'extérieur du cluster
- Remplace CoreDNS
- Livre le trafic interne uniquement aux endpoints du nœud du client
- Active le mTLS interne

## Solution

**Livre le trafic interne uniquement aux endpoints du nœud du client** est la bonne réponse : C'est l'analogue interne de l'externalTrafficPolicy : utile pour les daemons par nœud (agent de logs, cache node-local) où chaque pod doit parler à l'instance de son propre nœud — économisant sauts et latence. Sans endpoint local, le trafic est jeté.

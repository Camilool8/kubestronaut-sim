## Question

Qu'ajoute AdminNetworkPolicy (ANP) par rapport à la NetworkPolicy traditionnelle ?

## Options

- Seulement un pare-feu pour Internet
- Elle remplace le RBAC pour le trafic réseau
- Portée CLUSTER, priorité explicite et actions Allow/Deny/Pass
- Rien, c'est juste un renommage de la NetworkPolicy

## Solution

**Portée CLUSTER, priorité explicite et actions Allow/Deny/Pass** est la bonne réponse : L'ANP donne aux admins des garde-fous non contournables (ex. « jamais d'egress vers les métadonnées cloud »), évalués AVANT les NetworkPolicies des utilisateurs ; la BaselineAdminNetworkPolicy définit le défaut du cluster APRÈS. Ordre : ANP → NetworkPolicy → BANP.

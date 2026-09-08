## Question

À propos du comportement des NetworkPolicies, quelle affirmation est correcte ?

## Options

- Les policies exigent un ordre de priorité numérique
- La dernière policy appliquée écrase les précédentes
- Les policies sont additives (allow-list)
- Les policies marchent même sans support du CNI

## Solution

**Les policies sont additives (allow-list)** est la bonne réponse : Les NetworkPolicies natives ne font qu'autoriser : sélectionner un pod l'isole, et l'autorisé est l'union des règles. Pas de deny explicite ni de précédence — et l'enforcement dépend du CNI (Flannel pur les ignore). Les CRD Cilium/Calico ajoutent deny et priorité.

## Question

Quel est le moyen standardisé d'autoriser le trafic d'un namespace précis par NOM (ex. « monitoring ») dans une NetworkPolicy ?

## Options

- ipBlock avec le CIDR du namespace
- Écrire le nom littéral dans un champ from.namespace
- namespaceSelector avec le label kubernetes.io/metadata.name
- Impossible de sélectionner par nom

## Solution

**namespaceSelector avec le label kubernetes.io/metadata.name** est la bonne réponse : Chaque namespace reçoit automatiquement le label immuable `kubernetes.io/metadata.name`. L'utiliser dans le namespaceSelector permet de référencer les namespaces par nom sans labels manuels.

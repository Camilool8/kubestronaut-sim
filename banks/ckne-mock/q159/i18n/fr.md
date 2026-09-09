## Question

Vous devez n'autoriser que GET /public/* sur le service, en bloquant POST et les autres chemins, via la network policy du CNI. Que faut-il ?

## Options

- NetworkPolicy native avec un champ httpRules pour les méthodes HTTP
- Seulement un pare-feu externe en bordure du datacenter
- Des règles L7 (ex. CiliumNetworkPolicy avec toPorts.rules.http method/path)
- endPort couvrant la plage de ports HTTP suffit

## Solution

**Des règles L7 (ex. CiliumNetworkPolicy avec toPorts.rules.http method/path)** est la bonne réponse : Filtrer par méthode/chemin est du L7 : Cilium injecte un proxy transparent (Envoy) pour les flux couverts par la règle — l'API native ne voit pas le HTTP. Implication d'examen : les policies L7 ajoutent un saut de proxy (latence) uniquement là où elles s'appliquent.

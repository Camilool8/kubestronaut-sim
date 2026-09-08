## Question

Que fait un Service ExternalName ?

## Options

- Il crée un NodePort avec un nom personnalisé
- Il exige un LoadBalancer provisionné dans le cloud
- Il renvoie un CNAME vers un nom DNS externe — sans proxy ni endpoints
- Il attribue une IP externe fixe au pod

## Solution

**Il renvoie un CNAME vers un nom DNS externe — sans proxy ni endpoints** est la bonne réponse : `ExternalName` est du pur DNS : les requêtes renvoient un CNAME vers `spec.externalName`. Pas de VIP, pas de kube-proxy, pas de balancing — utile pour abstraire des services externes derrière des noms internes.

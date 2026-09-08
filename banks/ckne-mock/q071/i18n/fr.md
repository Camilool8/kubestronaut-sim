## Question

Dans le Corefile de CoreDNS, que fait la ligne `cache 30` dans le bloc serveur ?

## Options

- Cache des réponses jusqu'à 30 s, allégeant les upstreams
- Limite chaque pod à 30 requêtes
- Monte le TTL de tous les enregistrements à 30 minutes
- Crée 30 répliques de CoreDNS

## Solution

**Cache des réponses jusqu'à 30 s, allégeant les upstreams** est la bonne réponse : Le plugin `cache` stocke les réponses (succès et déni) jusqu'à la durée donnée, en respectant les TTL plus bas. C'est l'un des leviers de performance DNS les plus efficaces, avec un nombre adéquat de répliques CoreDNS.

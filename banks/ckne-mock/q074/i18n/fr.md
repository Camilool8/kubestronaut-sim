## Question

Quel avantage à définir targetPort avec un NOM (ex. targetPort: http) plutôt qu'un numéro ?

## Options

- C'est plus rapide
- Le nom référence la containerPort nommée de chaque pod
- Ça évite les conflits avec NodePort
- Les noms de ports sont obligatoires dans la Gateway API

## Solution

**Le nom référence la containerPort nommée de chaque pod** est la bonne réponse : Avec `targetPort: http`, chaque pod définit `ports[].name: http` avec le numéro qu'il veut (8080, 3000…). Le Service résout par pod — utile lors de migrations et rolling updates qui changent le port applicatif.

## Question

Deux règles d'une HTTPRoute matchent la même requête : l'une avec /api, l'autre avec /api/v2. Laquelle gagne ?

## Options

- Toujours la première du YAML
- Le choix est aléatoire
- Aucune ; la requête est rejetée en 404
- La règle la plus spécifique — plus long préfixe de path

## Solution

**La règle la plus spécifique — plus long préfixe de path** est la bonne réponse : La précédence de la Gateway API est déterministe : exact > préfixe le plus long, puis méthode, headers et query params ; en cas d'égalité entre routes, la plus ancienne (creationTimestamp, puis ordre alphabétique). Cela évite l'ambiguïté de routage.

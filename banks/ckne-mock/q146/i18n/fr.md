## Question

Vous avez un canary pondéré (90/10) ET une règle routant le header x-beta: true vers v2. Un utilisateur avec x-beta: true tombe parfois sur v1. Que revoir ?

## Options

- Le navigateur retire les headers
- La Gateway API ne supporte pas les matches de headers
- Si le match de header est dans la MÊME règle que les poids
- Les poids battent toujours les headers

## Solution

**Si le match de header est dans la MÊME règle que les poids** est la bonne réponse : Piège de structure : le canary par header exige une règle séparée (header match) évaluée comme plus spécifique ; la règle à poids seuls reste le fallback. Tout mélanger dans une règle produit une loterie pondérée pour tous.

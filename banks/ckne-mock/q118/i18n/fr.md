## Question

Quel manifeste isole complètement tous les pods d'un namespace (aucun trafic entrant NI sortant autorisé) ?

## Options

- Supprimer tous les Services
- Seulement policyTypes: [Ingress] avec podSelector: {}
- podSelector: {} avec policyTypes: [Ingress, Egress] et sans règles
- podSelector: {} avec ingress: [{}] et egress: [{}] déclarés

## Solution

**podSelector: {} avec policyTypes: [Ingress, Egress] et sans règles** est la bonne réponse : Tout sélectionner et déclarer les deux policyTypes sans règles = default deny total. La variante avec `[{}]` autorise tout (une règle vide matche toute source/destination) — le piège d'examen classique. Ensuite, chaque accès est accordé par des policies additionnelles.

## Question

Une NetworkPolicy a policyTypes: [Ingress], mais l'auteur a aussi écrit un bloc egress: dans la spec. Quel est l'effet du bloc egress ?

## Options

- Il est appliqué normalement
- Il bloque tout l'egress
- Il provoque une erreur de validation
- Il est IGNORÉ : policyTypes commande

## Solution

**Il est IGNORÉ : policyTypes commande** est la bonne réponse : L'enforcement suit `policyTypes`, pas la présence de sections. Sans « Egress » dans la liste, les règles egress écrites n'ont aucun effet (et aucune isolation egress n'est créée). Les règles « décoratives » passent les reviews — piège fréquent d'audit et d'examen.

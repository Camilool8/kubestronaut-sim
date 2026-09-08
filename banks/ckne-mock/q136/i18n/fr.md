## Question

Vous avez supprimé et recréé un Service du même nom. Les applis qui avaient mémorisé l'ancienne IP ont cassé. Quelle leçon d'architecture cela renforce-t-il ?

## Options

- L'ancienne IP revient en 24 h
- Il faudrait utiliser directement l'IP du pod
- Les Services ne peuvent pas être recréés
- Les ClusterIPs changent à chaque recréation du Service

## Solution

**Les ClusterIPs changent à chaque recréation du Service** est la bonne réponse : L'IP est allouée dynamiquement dans la plage de services à la création (sauf si spec.clusterIP la fige). Le contrat stable de Kubernetes est le NOM. Côté appli, le cache DNS (JVM !) mérite attention après recréation.

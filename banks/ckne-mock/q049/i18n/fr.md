## Question

Pourquoi la latence p99 d'un histogramme est-elle souvent plus révélatrice que la moyenne pour diagnostiquer des problèmes réseau ?

## Options

- La p99 utilise moins de mémoire
- La moyenne est impossible à calculer dans Prometheus
- Aucune différence pratique
- La moyenne cache la queue : la p99 expose le pire 1 % des requêtes

## Solution

**La moyenne cache la queue : la p99 expose le pire 1 % des requêtes** est la bonne réponse : Les problèmes réseau vivent dans la queue (retransmissions, files, conntrack). Avec `histogram_quantile(0.99, rate(..._bucket[5m]))`, on voit le pire 1 % — ce que les utilisateurs ressentent vraiment.

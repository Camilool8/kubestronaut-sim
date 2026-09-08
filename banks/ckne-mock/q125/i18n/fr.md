## Question

Que sont les exemplars dans Prometheus et comment aident-ils à dépanner la latence réseau ?

## Options

- Des dashboards Grafana prêts à l'emploi
- Des alertes e-mail avec graphiques joints
- Des répliques de sauvegarde de Prometheus
- Des échantillons dans les buckets d'histogrammes avec trace IDs

## Solution

**Des échantillons dans les buckets d'histogrammes avec trace IDs** est la bonne réponse : Les exemplars relient métriques et traces : quand la p99 grimpe dans Grafana, on clique l'exemplar du bucket lent et on ouvre la trace exacte (Tempo/Jaeger) — unifiant métriques → traces → logs pour trouver le saut responsable de la latence.

## Question

Votre Grafana réseau par pod a des millions de séries et Prometheus consomme des dizaines de Go. La plus grande source du problème est généralement :

## Options

- Le thème sombre de Grafana
- Des graphiques avec trop de couleurs
- Trop de dashboards ouverts en même temps
- La cardinalité explosive : labels par pod/veth/IP éphémères

## Solution

**La cardinalité explosive : labels par pod/veth/IP éphémères** est la bonne réponse : Les séries par entité éphémère (hash de pod, veth, IP) s'accumulent sans fin avec le churn. Règle d'or de l'observabilité réseau : labelliser par le STABLE (namespace/workload), dropper les labels volatils via relabeling, limiter les métriques par interface.

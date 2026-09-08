## Question

Après le redémarrage d'un pod, le graphe de rate(container_network_transmit_bytes_total[5m]) reste correct, bien que le compteur soit retombé à zéro. Pourquoi ?

## Options

- rate() détecte les resets de compteur et compense
- Prometheus interdit les redémarrages
- Les compteurs ne se réinitialisent jamais
- Le kubelet renvoie les anciennes données

## Solution

**rate() détecte les resets de compteur et compense** est la bonne réponse : Sémantique PromQL essentielle : `rate()`/`increase()` gèrent les resets (valeur inférieure à la précédente) en supposant la continuité. L'arithmétique manuelle sur compteurs bruts casse à chaque redémarrage — erreur courante des requêtes artisanales.

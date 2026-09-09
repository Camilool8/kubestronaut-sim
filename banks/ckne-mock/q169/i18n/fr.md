## Question

Le SLO de disponibilité du gateway est 99,9 %/mois. Quelle stratégie d'alerting évite à la fois le paging sur des micro-incidents et la découverte tardive d'une consommation lente du budget d'erreur ?

## Options

- Une seule alerte fixe à 1 % d'erreurs
- Des alertes burn-rate multi-fenêtres (fenêtre rapide + lente)
- Couper les alertes la nuit
- Alerter sur chaque erreur individuelle

## Solution

**Des alertes burn-rate multi-fenêtres (fenêtre rapide + lente)** est la bonne réponse : Le burn rate = vitesse de consommation du budget d'erreur. Les fenêtres courtes+longues combinées (ex. 14,4x sur 5 m/1 h et 1x sur 6 h/3 j) attrapent les incidents aigus ET les dégradations lentes, avec très peu de faux positifs — pratique SRE canonique pour les SLO réseau.

## Question

Pourquoi les certificats de workload des service meshes (SVIDs) ont-ils une vie courte (ex. 24 h) et une rotation automatique ?

## Options

- Pour économiser de l'espace disque sur les nœuds
- Pour forcer un redémarrage quotidien des pods
- Fenêtre courte pour les certificats compromis, sans dépendre de la révocation
- Parce que TLS expire en 24 h selon une norme IETF

## Solution

**Fenêtre courte pour les certificats compromis, sans dépendre de la révocation** est la bonne réponse : Vie courte = exposition courte : un certificat fuité vaut des heures, pas des années, et la révocation (historiquement cassée : CRL/OCSP) devient inutile. istio-agent/SPIRE renouvellent les SVIDs automatiquement avant expiration, sans redémarrer les workloads.

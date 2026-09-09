## Question

Les apps se plaignent d'une résolution lente des noms externes (ex. api.github.com) depuis les pods. tcpdump montre plusieurs NXDOMAIN avant la bonne réponse. Cause et mitigation ?

## Options

- CoreDNS est corrompu et répond en retard
- Le TTL de l'enregistrement est nul
- Expansion du ndots:5 par les search domains (utilisez un FQDN avec point final)
- Bande passante insuffisante entre les nœuds et CoreDNS

## Solution

**Expansion du ndots:5 par les search domains (utilisez un FQDN avec point final)** est la bonne réponse : Avec `ndots:5`, tout nom de moins de 5 points est d'abord étendu par les search domains — 3 à 5 requêtes (NXDOMAIN) supplémentaires par résolution. Un point final force la requête absolue ; `dnsConfig.options ndots:1` change le comportement par pod.

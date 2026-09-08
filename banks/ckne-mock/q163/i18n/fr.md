## Question

Les applis signalent des timeouts DNS intermittents d'EXACTEMENT 5 secondes sous charge. Cause classique et mitigation ?

## Options

- Un câble réseau défectueux sur un des nœuds
- CoreDNS est lent sous n'importe quelle charge
- TTL nul dans les enregistrements renvoyés par l'upstream
- Race condition du conntrack avec des requêtes UDP parallèles

## Solution

**Race condition du conntrack avec des requêtes UDP parallèles** est la bonne réponse : Les « 5 secondes maudites » : drops dus à une race d'insertion dans le conntrack avec les requêtes A+AAAA parallèles du même socket ; le résolveur attend 5 s (défaut) et réessaie. Mitigations : NodeLocal DNSCache (retire le NAT du chemin), single-request-reopen, ou forcer le TCP.

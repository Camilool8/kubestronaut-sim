## Question

En annonçant le même VIP LoadBalancer via BGP depuis plusieurs nœuds, quel mécanisme du routeur répartit le trafic ?

## Options

- ECMP (Equal-Cost Multi-Path)
- NAT inverse sur le routeur de bordure
- DNS round-robin avec TTL bas
- STP (Spanning Tree Protocol) entre les switches

## Solution

**ECMP (Equal-Cost Multi-Path)** est la bonne réponse : Avec ECMP, le routeur installe plusieurs next-hops de coût égal et hache par flux (5-tuple) vers les nœuds annonceurs — vrai balancing réseau, avec convergence rapide quand un nœud cesse d'annoncer (BFD accélère la détection).

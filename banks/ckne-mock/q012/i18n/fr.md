## Question

Quel est l'avantage principal du mode IPVS de kube-proxy par rapport au mode iptables ?

## Options

- Support natif du balancing L7 (HTTP) avec inspection des headers
- Complexité O(1) au forwarding et algorithmes de balancing
- Il n'a pas besoin du module conntrack
- Il chiffre le trafic pod-à-pod

## Solution

**Complexité O(1) au forwarding et algorithmes de balancing** est la bonne réponse : En mode iptables, les règles croissent avec le nombre de Services et sont évaluées séquentiellement. IPVS utilise des tables de hachage kernel (~O(1)) et offre round-robin, least-connections, source-hash. Les deux restent du L4.

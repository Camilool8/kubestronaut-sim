## Question

Avec kube-proxy en mode iptables, quelle chaîne est le point d'entrée où le trafic destiné aux Services est intercepté ?

## Options

- KUBE-NODEPORTS
- KUBE-SERVICES
- CNI-ISOLATION
- KUBE-FORWARD

## Solution

**KUBE-SERVICES** est la bonne réponse : La chaîne `KUBE-SERVICES` (appelée depuis PREROUTING/OUTPUT de la table nat) contient une règle par Service et saute vers les chaînes `KUBE-SVC-*`, qui balancent vers `KUBE-SEP-*` (endpoints, où se fait le DNAT). Debug : `iptables -t nat -L KUBE-SERVICES`.

## Question

Welche Chain ist bei kube-proxy im iptables-Modus der Einstiegspunkt, an dem Traffic zu Services abgefangen wird?

## Options

- KUBE-NODEPORTS
- KUBE-SERVICES
- CNI-ISOLATION
- KUBE-FORWARD

## Solution

**KUBE-SERVICES** ist die richtige Antwort: Die Chain `KUBE-SERVICES` (aus PREROUTING/OUTPUT der nat-Tabelle) enthält eine Regel pro Service und springt in `KUBE-SVC-*`-Chains, die auf `KUBE-SEP-*` (Endpoints, dort DNAT) balancieren. Debug mit `iptables -t nat -L KUBE-SERVICES`.

## Question

Welche Transformation erfährt Pod-Traffic standardmäßig, wenn er zu einem Ziel außerhalb des Clusters den Node verlässt?

## Options

- Keine — die Pod-IP ist immer im Internet routbar
- Er wird nach IPv6 konvertiert
- SNAT/Masquerade: Die Quell-IP wird zur Node-IP
- Traffic wird standardmäßig blockiert

## Solution

**SNAT/Masquerade: Die Quell-IP wird zur Node-IP** ist die richtige Antwort: CNIs masqueraden Ziele außerhalb der Cluster-CIDRs (MASQUERADE/KUBE-POSTROUTING-artige Regeln): Der externe Server sieht die Node-IP. Anpassbar (z. B. `ip-masq-agent` mit nonMasqueradeCIDRs), wenn Pod-IPs im Firmennetz routbar sind.

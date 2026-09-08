## Question

Ein Pod wurde mit dnsPolicy: Default konfiguriert. Was ist das Verhalten — und warum ist der Name tückisch?

## Options

- Nutzt ein festes 8.8.8.8
- Deaktiviert DNS komplett
- Erbt die resolv.conf des NODES
- Er nutzt das Cluster-DNS, wie der Name nahelegt

## Solution

**Erbt die resolv.conf des NODES** ist die richtige Antwort: Klassische Namensfalle: `Default` heißt "vom Node erben" (keine Cluster-Search-Domains) — Services lösen nicht mehr auf. Die tatsächlich standardmäßig angewandte Policy für Pods ist `ClusterFirst`.

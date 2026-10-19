**L7 rules (e.g., CiliumNetworkPolicy with toPorts.rules.http method/path)** is correct: Filtering by method/path is L7: Cilium injects a transparent proxy for the flows covered by the rule. Exam implication: L7 policies add a proxy hop (latency) only where applied.

Why the others are wrong:

- **Native NetworkPolicy with an httpRules field for HTTP methods** — native NetworkPolicy has no HTTP fields; method and path filtering is a CNI extension.
- **Only an external firewall at the datacenter edge** — an edge firewall does not see traffic between pods inside the cluster, and works at L3/L4 anyway.
- **endPort covering the HTTP port range is enough** — `endPort` widens an L4 port range; it says nothing about methods or paths.

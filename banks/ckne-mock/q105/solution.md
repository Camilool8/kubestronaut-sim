**CiliumNetworkPolicy with toFQDNs** is correct: Native NetworkPolicy only takes IPs/selectors. Cilium intercepts DNS (dns proxy), learns the IPs resolved for the allowed FQDN and authorizes them dynamically — the policy follows the name, not the IP. You must also allow DNS egress with toPorts 53 rules.

Why the others are wrong:

- **hostAliases on the pod** — `hostAliases` writes entries into the pod's `/etc/hosts`; it controls name resolution, not which destinations the policy permits.
- **Native NetworkPolicy with a dns field** — native NetworkPolicy has no DNS-aware fields; it only understands IPs and selectors.
- **ipBlock with all GitHub ranges updated manually** — GitHub's address ranges change; a manual list is stale the day it is written and lets traffic break or leak.

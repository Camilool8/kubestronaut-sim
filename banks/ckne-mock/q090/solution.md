**selectors, destinationCIDRs and egressGateway with egressIP** is correct: The policy matches the traffic (selected pods → destination CIDRs) and redirects it to the gateway node, which SNATs to the configured `egressIP` — providing a fixed, auditable egress IP for external firewalls.

Why the others are wrong:

- **the resource's name, namespace, labels and annotations** — metadata describes the object; it says nothing about which traffic is redirected or to where.
- **port, targetPort and nodePort** — those are Service port fields; an egress policy does not involve ports.
- **ingress, egress and policyTypes** — those are NetworkPolicy fields, which allow or deny traffic — an egress gateway policy redirects and SNATs it.

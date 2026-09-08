## Question

Was sind die drei Schlüsselelemente einer CiliumEgressGatewayPolicy?

## Options

- selectors, destinationCIDRs und egressGateway mit egressIP
- name, namespace, labels und annotations der Ressource
- port, targetPort und nodePort
- ingress, egress und policyTypes

## Solution

**selectors, destinationCIDRs und egressGateway mit egressIP** ist die richtige Antwort: Die Policy matcht den Traffic (selektierte Pods → Ziel-CIDRs) und leitet ihn zum Gateway-Node um, der auf die konfigurierte `egressIP` SNATet — feste, auditierbare Egress-IP für externe Firewalls.

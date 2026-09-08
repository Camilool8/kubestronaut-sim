## Question

Quels sont les trois éléments clés d'une CiliumEgressGatewayPolicy ?

## Options

- selectors, destinationCIDRs et egressGateway avec egressIP
- name, namespace, labels et annotations de la ressource
- port, targetPort et nodePort
- ingress, egress et policyTypes

## Solution

**selectors, destinationCIDRs et egressGateway avec egressIP** est la bonne réponse : La policy matche le trafic (pods sélectionnés → CIDRs de destination) et le redirige vers le nœud gateway, qui fait un SNAT vers l'`egressIP` configurée — IP de sortie fixe et auditable pour les pare-feu externes.

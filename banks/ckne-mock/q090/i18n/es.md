## Question

¿Cuáles son los tres elementos principales de una CiliumEgressGatewayPolicy?

## Options

- selectors, destinationCIDRs y egressGateway con egressIP
- nombre, namespace, labels y annotations del recurso
- port, targetPort y nodePort
- ingress, egress y policyTypes

## Solution

**selectors, destinationCIDRs y egressGateway con egressIP** es la respuesta correcta: La policy hace match con el tráfico (pods seleccionados → CIDR de destino) y lo redirige al nodo gateway, que aplica SNAT hacia el `egressIP` configurado, proporcionando una IP de salida fija y auditable para firewalls externos.

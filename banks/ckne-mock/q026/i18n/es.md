## Question

Su empresa exige que todo el tráfico de salida del cluster hacia una API externa proceda de una IP fija para incluirla en la allow-list del firewall. ¿Qué solución debe aplicar?

## Options

- Ampliar el pod CIDR
- Utilizar hostPort en los pods
- Cambiar el Service a ExternalName
- Configurar un Egress Gateway

## Solution

**Configurar un Egress Gateway** es la respuesta correcta: Los egress gateways concentran la salida en nodos/IP específicos: en Cilium, una `CiliumEgressGatewayPolicy` aplica SNAT hacia el egressIP de un nodo gateway; en Istio, el tráfico sale mediante el egress gateway del mesh. Sin esto, la IP de salida depende del nodo donde se ejecute el pod.

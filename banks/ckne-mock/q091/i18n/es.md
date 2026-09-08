## Question

Las IP de sus pods son enrutables en el datacenter, pero el tráfico hacia la red interna 10.0.0.0/8 sigue saliendo con SNAT y la IP del nodo. ¿Cómo conserva la IP del pod para esos destinos?

## Options

- Utilizar hostNetwork en todos los pods
- Configurar ip-masq-agent
- Desactivar kube-proxy
- Es imposible sin un service mesh

## Solution

**Configurar ip-masq-agent** es la respuesta correcta: `ip-masq-agent` controla el masquerading por destino: los CIDR incluidos en nonMasqueradeCIDRs salen con la IP original del pod. Los CNI tienen equivalentes (Cilium ipMasqAgent y Calico natOutgoing por IPPool).

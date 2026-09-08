## Question

¿Cuáles son los componentes principales de Submariner para conectar clusters?

## Options

- Broker, nodos Gateway y Lighthouse
- Hub, Spoke y Wheel
- Master, Worker y Etcd
- Ingress, Egress y Midgress

## Solution

**Broker, nodos Gateway y Lighthouse** es la respuesta correcta: Broker (en un cluster o dedicado) sincroniza los endpoints; los nodos Gateway establecen túneles cifrados entre clusters, incluso con CIDR superpuestos mediante Globalnet; Lighthouse resuelve `clusterset.local` e implementa la API MCS.

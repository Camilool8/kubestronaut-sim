## Question

En Cilium Cluster Mesh, ¿cuál es el requisito de red fundamental entre los clusters conectados?

## Options

- Un único etcd compartido entre los clusters
- PodCIDR y ClusterID únicos y no superpuestos, además de conectividad directa entre los nodos de los clusters
- Todos los clusters en la misma zona de disponibilidad
- La misma versión exacta del kernel en todos los nodos

## Solution

**PodCIDR y ClusterID únicos y no superpuestos, además de conectividad directa entre los nodos de los clusters** es la respuesta correcta: Cluster Mesh requiere CIDR de pods no superpuestos, `cluster.id`/`cluster.name` únicos y alcance mutuo entre nodos. Con ello se obtiene descubrimiento global de servicios, balanceo entre clusters y políticas entre clusters.

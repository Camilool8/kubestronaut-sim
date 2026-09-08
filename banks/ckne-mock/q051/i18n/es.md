## Question

Las conexiones fallan de forma intermitente bajo carga y dmesg del nodo muestra "nf_conntrack: table full, dropping packet". ¿Qué métrica lo confirma y cuál es la corrección?

## Options

- Reiniciar el CNI lo corrige de forma definitiva
- Comparar node_nf_conntrack_entries con node_nf_conntrack_entries_limit
- Observar apiserver_request_total y escalar apiserver
- Comprobar coredns_cache_hits_total y limpiar la caché de CoreDNS

## Solution

**Comparar node_nf_conntrack_entries con node_nf_conntrack_entries_limit** es la respuesta correcta: Cada conexión sometida a NAT ocupa una entrada conntrack. Tabla llena = drops silenciosos y fallos intermitentes. Monitorice la relación entries/limit en node_exporter y ajuste `nf_conntrack_max`.

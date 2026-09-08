## Question

Dentro de un pod, ¿a qué dirección apunta el nameserver de /etc/resolv.conf en la configuración predeterminada (dnsPolicy: ClusterFirst)?

## Options

- Directamente a la IP del pod de CoreDNS
- Al ClusterIP del Service kube-dns
- 127.0.0.53 (systemd-resolved)
- Al resolv.conf del nodo, copiado sin cambios

## Solution

**Al ClusterIP del Service kube-dns** es la respuesta correcta: Con `ClusterFirst`, el kubelet inyecta el ClusterIP del Service `kube-dns` (configurado mediante `--cluster-dns`) como nameserver, además de dominios de búsqueda como `<ns>.svc.cluster.local` y `ndots:5`.

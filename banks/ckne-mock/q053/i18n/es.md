## Question

La aplicación informa de alta latencia entre dos servicios. node_netstat_Tcp_RetransSegs aumenta rápidamente en los nodos implicados. ¿Qué indica esto?

## Options

- Pérdida de paquetes en la ruta (MTU/fragmentación, colas llenas o enlace defectuoso) que obliga a retransmisiones TCP
- Que DNS es lento
- Que etcd necesita compactación
- Que al Deployment le faltan réplicas

## Solution

**Pérdida de paquetes en la ruta (MTU/fragmentación, colas llenas o enlace defectuoso) que obliga a retransmisiones TCP** es la respuesta correcta: Retransmisiones TCP = pérdida de paquetes. Un culpable frecuente es una MTU incorrecta con overlay (VXLAN consume unos 50 bytes). Valide con `ping -M do -s 1472`, `tcpdump` y la MTU del CNI.

## Question

Los pods del mismo nodo se comunican, pero los pods de nodos diferentes no. El CNI utiliza VXLAN. ¿Cuál es la causa más probable?

## Options

- kube-scheduler está mal configurado
- El puerto UDP de VXLAN está bloqueado entre los nodos
- Los pods necesitan hostPort para el tráfico entre nodos
- CoreDNS está caído

## Solution

**El puerto UDP de VXLAN está bloqueado entre los nodos** es la respuesta correcta: El tráfico entre nodos depende de la encapsulación. Si un firewall bloquea el puerto UDP de VXLAN (8472 para Flannel/Cilium, 4789 como valor predeterminado de IANA), la comunicación entre nodos falla. Compruebe con `tcpdump -i any udp port 8472` y las reglas del firewall/security group.

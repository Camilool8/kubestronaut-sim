## Question

Los pods quedan bloqueados en ContainerCreating con el error "failed to allocate for range 0: no IP addresses available in range". ¿Cuál es el diagnóstico y la corrección?

## Options

- El DNS del cluster está caído
- El pool IPAM del nodo está agotado
- El kubelet se quedó sin memoria
- El apiserver está limitando las solicitudes

## Solution

**El pool IPAM del nodo está agotado** es la respuesta correcta: Cada nodo tiene un rango finito (podCIDR /24 predeterminado ≈ 254 IP frente a max-pods 110). Los fallos pueden dejar leases huérfanos en el estado IPAM (por ejemplo, `/var/lib/cni/networks/<net>`). Elimine archivos de IP sin un contenedor correspondiente o redimensione el rango.

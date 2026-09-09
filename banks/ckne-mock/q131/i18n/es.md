## Question

Las conexiones TCP entre nodos sobre VXLAN fallan de forma extraña (handshake correcto, datos corruptos o bloqueados). Un workaround conocido es `ethtool -K flannel.1 tx-checksum-ip-generic off`. ¿Cuál es el problema subyacente?

## Options

- El kernel no admite TCP sobre VXLAN
- Falta de memoria
- MTU demasiado alta en todas las interfaces físicas
- El checksum offload del driver se calcula incorrectamente con VXLAN

## Solution

**El checksum offload del driver se calcula incorrectamente con VXLAN** es la respuesta correcta: Un clásico de producción: el checksum offload de la interfaz VXLAN genera checksums inválidos en ciertas combinaciones de kernel/driver. Deshabilitar el offload en el vtep lo corrige y explica el caso "ping funciona, la aplicación se bloquea".

## Question

El CNI utiliza MTU 1450 en las interfaces de los pods y la red física admite jumbo frames (9000). ¿Qué configuración obtiene el máximo rendimiento con VXLAN?

## Options

- Deshabilitar VXLAN
- MTU 65535 en los pods
- Aumentar la MTU física a 9000 y configurar los pods en 8950
- Mantener 1450: es obligatorio con cualquier VXLAN

## Solution

**Aumentar la MTU física a 9000 y configurar los pods en 8950** es la respuesta correcta: El límite del pod siempre es MTU física − overhead (unos 50 bytes para VXLAN). Con jumbo frames end-to-end, 8950 en los pods multiplica el throughput de workloads de datos. El error común es aumentar solo un lado.

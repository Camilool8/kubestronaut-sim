## Question

De forma predeterminada, cuando un pod accede a un destino fuera del cluster, ¿qué transformación sufre el tráfico al salir del nodo?

## Options

- Ninguna: la IP del pod siempre es enrutable en internet
- Se convierte a IPv6
- SNAT/masquerade: la IP de origen se convierte en la IP del nodo
- El tráfico se bloquea de forma predeterminada

## Solution

**SNAT/masquerade: la IP de origen se convierte en la IP del nodo** es la respuesta correcta: Los CNI aplican masquerade para destinos fuera de los CIDR del cluster: el servidor externo ve la IP del nodo. Esto se puede ajustar (por ejemplo, `ip-masq-agent` con nonMasqueradeCIDRs) cuando las IP de los pods son enrutables en la red de la empresa.

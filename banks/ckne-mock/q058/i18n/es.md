## Question

¿Qué comando muestra las entradas de seguimiento de conexiones (NAT/estado) para investigar dónde se traduce la conexión de un pod?

## Options

- free -m
- lsof -i
- systemctl status conntrack
- conntrack -L | grep `<pod-IP>`

## Solution

**conntrack -L | grep `<pod-IP>`** es la respuesta correcta: `conntrack -L` muestra la tabla de connection tracking del kernel: se ve la tupla original (pod→ClusterIP) y la traducida (pod→endpoint) después del DNAT de kube-proxy, algo esencial para confirmar que el NAT del Service está ocurriendo.

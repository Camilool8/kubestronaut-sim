## Question

Al reiniciar el agente BGP (upgrade de Cilium/Calico) en un nodo, el tráfico hacia los VIP que anunciaba cayó durante unos 30 segundos hasta restablecerse la sesión. ¿Qué dos mecanismos reducen este impacto?

## Options

- Cambiar siempre BGP por L2
- Graceful Restart (mantiene rutas durante el reinicio) y BFD (detección en milisegundos)
- Añadir réplicas de CoreDNS y kube-apiserver durante el upgrade
- Reducir la MTU del túnel entre los nodos

## Solution

**Graceful Restart (mantiene rutas durante el reinicio) y BFD (detección en milisegundos)** es la respuesta correcta: Graceful Restart diferencia un "reinicio planificado" de un "nodo muerto" y conserva el forwarding; BFD acelera la detección cuando el nodo REALMENTE muere. Juntos permiten upgrades sin blackholes y failover subsegundo.

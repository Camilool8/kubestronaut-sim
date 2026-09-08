## Question

El tráfico de un pod se está descartando en algún punto de la pila del kernel y no sabe dónde (¿iptables, tc, route?). ¿Qué herramienta eBPF rastrea la ruta del paquete por el kernel y muestra DÓNDE fue descartado?

## Options

- un kubectl describe pod detallado
- df -h
- top
- pwru (packet, where are you?)

## Solution

**pwru (packet, where are you?)** es la respuesta correcta: `pwru` (de Cilium) instrumenta el kernel con eBPF e imprime el recorrido del paquete función por función (hooks de netfilter, rutas, tc), incluida la razón y ubicación del drop. Resuelve casos en los que tcpdump muestra el paquete entrando, pero nunca saliendo.

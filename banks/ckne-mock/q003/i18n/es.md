## Question

Necesita capturar el tráfico de un pod específico directamente en el nodo, sin entrar en el pod. ¿Cuál es el enfoque correcto?

## Options

- Ejecutar tcpdump -i eth0 en el nodo, porque todo el tráfico de los pods pasa por eth0 sin cambios
- No es posible; tcpdump solo funciona dentro del pod
- Identificar la interfaz veth del pod en el host y ejecutar tcpdump -i vethXXXX
- Ejecutar tcpdump -i lo, porque los pods utilizan el loopback del host

## Solution

**Identificar la interfaz veth del pod en el host y ejecutar tcpdump -i vethXXXX** es la respuesta correcta: Cada pod tiene un par veth: un extremo dentro del netns del pod (eth0) y el otro en el host (vethXXXX). Localice el par comparando los índices de las interfaces y capture con `tcpdump -i vethXXXX`. Alternativa: `nsenter -t <PID> -n tcpdump`.

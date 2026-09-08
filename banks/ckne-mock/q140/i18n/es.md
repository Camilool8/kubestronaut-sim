## Question

CoreDNS entra en CrashLoopBackOff justo después de instalarse y registra "Loop ... detected". ¿Cuál es la causa típica en nodos con systemd-resolved?

## Options

- Falta RBAC para el ServiceAccount de CoreDNS
- Una imagen corrupta en el registry interno
- El resolv.conf del nodo apunta a 127.0.0.53
- Demasiadas réplicas

## Solution

**El resolv.conf del nodo apunta a 127.0.0.53** es la respuesta correcta: El plugin `loop` existe precisamente para detectar este ciclo: forward → stub local → CoreDNS de nuevo. El flag `--resolv-conf` de kubelet (o configuración equivalente) lo resuelve.

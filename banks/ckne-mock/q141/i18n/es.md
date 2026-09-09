## Question

El Service es correcto (port 80 → targetPort 8080), los endpoints están ready, pero todas las conexiones reciben "connection refused". Dentro del pod, `ss -tlnp` muestra el proceso escuchando en 127.0.0.1:8080. ¿Cuál es el problema?

## Options

- kube-proxy está caído en ese nodo
- La aplicación solo hace bind a localhost
- Necesita hostNetwork
- El puerto 8080 está reservado por kubelet

## Solution

**La aplicación solo hace bind a localhost** es la respuesta correcta: La trampa número uno para un "refused" cuando todo parece correcto es el bind a loopback. DNAT entrega a la IP del pod, donde nadie escucha. `ss -tlnp` dentro del pod lo revela inmediatamente.

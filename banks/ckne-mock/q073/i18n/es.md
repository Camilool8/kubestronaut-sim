## Question

En un Service, ¿cuál es la diferencia entre port, targetPort y nodePort?

## Options

- Son sinónimos
- port es el puerto propio del Service
- Solo nodePort es obligatorio
- port pertenece al contenedor, targetPort al nodo y nodePort al Service

## Solution

**port es el puerto propio del Service** es la respuesta correcta: El cliente accede a `ClusterIP:port`; kube-proxy aplica DNAT hacia `podIP:targetPort`; si el tipo expone los nodos, `nodePort` es el puerto externo en cada nodo. Confundir port con targetPort es una causa común de "connection refused".

## Question

En un Service LoadBalancer/NodePort, ¿qué hace externalTrafficPolicy: Local?

## Options

- Reenvía únicamente a endpoints locales del nodo y conserva la IP del cliente
- Restringe el acceso a clientes de la misma subred
- Fuerza el modo IPVS
- Deshabilita el balanceo y envía todo al primer endpoint

## Solution

**Reenvía únicamente a endpoints locales del nodo y conserva la IP del cliente** es la respuesta correcta: Con `Local`, un nodo solo reenvía a pods locales; no hay SNAT, por lo que se conserva la IP real del cliente. Los nodos sin endpoints se eliminan del LB mediante healthCheckNodePort. Con `Cluster` (predeterminado), puede existir un segundo salto con SNAT.

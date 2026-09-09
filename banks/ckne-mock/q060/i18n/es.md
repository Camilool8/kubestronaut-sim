## Question

En un CNI con modo de enrutamiento nativo (sin encapsulación), ¿qué espera ver en `ip route` del nodo?

## Options

- Rutas hacia los podCIDR de otros nodos mediante la IP del nodo vecino
- Rutas /32 para cada pod de todo el cluster
- Ninguna ruta relacionada con pods
- Solo la ruta default apuntando al gateway físico

## Solution

**Rutas hacia los podCIDR de otros nodos mediante la IP del nodo vecino** es la respuesta correcta: En modo de enrutamiento directo/nativo, los paquetes no se encapsulan: cada nodo debe saber que el podCIDR del vecino es accesible mediante la IP del vecino. Estas rutas las instala el CNI o se aprenden mediante BGP. Su ausencia rompe el tráfico entre nodos.

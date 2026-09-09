## Question

¿Qué comportamiento de red presenta un pod con hostNetwork: true?

## Options

- Pierde la conectividad externa
- Recibe normalmente una IP del pod CIDR
- Solo se comunica con pods del mismo namespace
- Comparte el namespace de red del nodo y utiliza la IP del nodo

## Solution

**Comparte el namespace de red del nodo y utiliza la IP del nodo** es la respuesta correcta: Con `hostNetwork: true`, el pod no recibe un netns propio: utiliza la IP y las interfaces del nodo. Los puertos abiertos compiten con los procesos del host y las NetworkPolicies basadas en podSelector normalmente no se aplican como se espera.

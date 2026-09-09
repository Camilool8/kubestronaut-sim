## Question

Al utilizar IPsec en Cilium, ¿dónde se almacena la clave y qué práctica operativa es necesaria?

## Options

- Incrustada en la imagen del agent
- En un archivo del portátil del administrador
- En el Secret cilium-ipsec-keys
- IPsec no necesita ninguna clave

## Solution

**En el Secret cilium-ipsec-keys** es la respuesta correcta: Cilium lee la clave y el algoritmo desde el Secret `cilium-ipsec-keys`. La rotación es una tarea operativa: se genera una clave nueva con un ID incrementado y los agents realizan la transición sin downtime. WireGuard, en cambio, administra automáticamente claves por nodo.

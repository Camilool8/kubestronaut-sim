## Question

¿Qué hace el campo internalTrafficPolicy: Local en un Service?

## Options

- Bloquea todo el tráfico procedente de fuera del cluster
- Sustituye CoreDNS
- Entrega el tráfico interno únicamente a endpoints del nodo del cliente
- Habilita mTLS interno

## Solution

**Entrega el tráfico interno únicamente a endpoints del nodo del cliente** es la respuesta correcta: Es el equivalente interno de externalTrafficPolicy: resulta útil para daemons por nodo (por ejemplo, un agente de logs o una caché node-local) donde cada pod debe comunicarse con la instancia de su propio nodo, ahorrando saltos y latencia.

## Question

Con cifrado WireGuard node-to-node habilitado en el CNI, ¿se cifra el tráfico entre dos pods del MISMO nodo?

## Options

- No: el cifrado cubre el tráfico que cruza la red ENTRE nodos
- Sí, siempre
- Solo para UDP
- Solo si los pods están en namespaces diferentes

## Solution

**No: el cifrado cubre el tráfico que cruza la red ENTRE nodos** es la respuesta correcta: El objetivo es proteger el tráfico en tránsito contra la interceptación en la red. Los paquetes entre pods del mismo nodo viajan únicamente por memoria/bridge local. Si el requisito es cifrar y autenticar CADA salto lógico, combine con mTLS del mesh.

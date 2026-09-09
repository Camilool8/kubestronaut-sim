## Question

¿Qué campos esenciales componen un recurso Certificate de cert-manager?

## Options

- key, cert y ca en texto claro
- host, path y backend
- secretName, dnsNames e issuerRef
- image, replicas y ports

## Solution

**secretName, dnsNames e issuerRef** es la respuesta correcta: Certificate declara el estado deseado; cert-manager emite mediante `issuerRef`, escribe la clave y el certificado en el Secret indicado por `secretName` y renueva automáticamente. Gateway/Ingress solo necesita referenciar el Secret.

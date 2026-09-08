## Question

¿Cómo permite un RANGO de puertos (por ejemplo, 30000 a 32767) en una sola regla de NetworkPolicy?

## Options

- NetworkPolicy no admite rangos
- Utilizar el protocolo RANGE
- Enumerar uno por uno los 2768 puertos en varias reglas
- Utilizar port: 30000 con endPort: 32767 en la misma entrada

## Solution

**Utilizar port: 30000 con endPort: 32767 en la misma entrada** es la respuesta correcta: El campo `endPort` define el final del rango iniciado en `port` y requiere un puerto numérico, no uno con nombre. Es estable desde Kubernetes 1.25.

## Question

¿Qué ventaja tiene definir targetPort mediante un NOMBRE (por ejemplo, targetPort: http) en lugar de un número?

## Options

- Es más rápido
- El nombre referencia el containerPort con nombre de cada pod
- Evita conflictos con NodePort
- Los nombres de puerto son obligatorios en Gateway API

## Solution

**El nombre referencia el containerPort con nombre de cada pod** es la respuesta correcta: Con `targetPort: http`, cada pod define `ports[].name: http` con el número que desee (8080, 3000…). El Service lo resuelve por pod, algo útil en migraciones y rolling updates que cambian el puerto de la aplicación.

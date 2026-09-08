## Question

¿Qué efecto tiene configurar sessionAffinity: ClientIP en un Service HEADLESS?

## Options

- Ningún efecto práctico sobre el flujo
- Convierte el Service en NodePort
- Siempre produce un error de validación
- Afinidad perfecta por cliente

## Solution

**Ningún efecto práctico sobre el flujo** es la respuesta correcta: La afinidad es una función del proxy sobre el VIP. Headless ofrece DNS puro: el "balanceador" es el resolver/cliente. La configuración se acepta, pero no tiene efecto; un clásico de examen.

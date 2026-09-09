## Question

Antes de promover una versión nueva, desea enviarle una COPIA del tráfico real de producción sin que sus respuestas afecten a los clientes. ¿Qué filtro de HTTPRoute lo hace?

## Options

- requestMirror (shadow traffic)
- urlRewrite
- retryPolicy
- backendRefs con peso 50/50

## Solution

**requestMirror (shadow traffic)** es la respuesta correcta: `RequestMirror` implementa shadowing: producción sigue siendo atendida por el backend principal mientras la versión nueva recibe tráfico idéntico para validar errores y latencia, sin riesgo para el usuario, a diferencia de canary, que sirve respuestas reales.

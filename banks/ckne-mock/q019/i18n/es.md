## Question

En Gateway API, ¿cuál es la división correcta de responsabilidades entre Gateway y HTTPRoute?

## Options

- Ambos hacen lo mismo; HTTPRoute es solo el nombre nuevo
- Gateway define las reglas de enrutamiento; HTTPRoute define los listeners
- Gateway es administrado por el operador de infraestructura y define listeners/direcciones
- HTTPRoute sustituye al Service; Gateway sustituye al Deployment

## Solution

**Gateway es administrado por el operador de infraestructura y define listeners/direcciones** es la respuesta correcta: Modelo orientado a roles: `GatewayClass` (implementación), `Gateway` (infraestructura: listeners, puertos, TLS) y `HTTPRoute` (aplicación: matches, filtros, backends). La route referencia al Gateway en `parentRefs` y a los Services en `backendRefs`.

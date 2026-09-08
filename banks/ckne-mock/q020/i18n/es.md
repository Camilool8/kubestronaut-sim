## Question

Un HTTPRoute en un namespace diferente del Gateway no funciona. ¿Qué suele ser necesario ajustar?

## Options

- El campo listeners.allowedRoutes.namespaces del Gateway
- El Service backend debe ser NodePort
- Los HTTPRoutes solo funcionan en el namespace del Gateway, sin excepciones
- El HTTPRoute necesita hostNetwork

## Solution

**El campo listeners.allowedRoutes.namespaces del Gateway** es la respuesta correcta: De forma predeterminada, `allowedRoutes.namespaces.from` es `Same`. Para aceptar routes de otros namespaces, utilice `from: All` o `from: Selector` en el listener. Para backends en otros namespaces también necesita un `ReferenceGrant`.

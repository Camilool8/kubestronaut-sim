## Question

¿Qué recurso sustituyó al objeto Endpoints como mecanismo principal y escalable para rastrear los backends de un Service?

## Options

- EndpointSlice
- PodDisruptionBudget
- BackendConfig
- ServiceEntry

## Solution

**EndpointSlice** es la respuesta correcta: `EndpointSlice` divide los endpoints en slices (hasta 100 por slice de forma predeterminada), reduciendo el coste de actualización en Services grandes y añadiendo topología (zona, nodo). El antiguo objeto Endpoints se mantiene por compatibilidad.

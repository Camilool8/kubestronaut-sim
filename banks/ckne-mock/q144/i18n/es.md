## Question

En un HTTPRoute con dos backendRefs, uno tiene weight: 0. ¿Qué ocurre con ese backend?

## Options

- Sigue recibiendo la mitad del tráfico
- La route se rechaza
- weight: 0 es inválido
- No recibe NINGUNA solicitud nueva

## Solution

**No recibe NINGUNA solicitud nueva** es la respuesta correcta: Peso cero = fracción 0 del tráfico. Es intencionadamente válido: mantiene el backend "conectado" para cambiar el tráfico al instante (0↔100) sin modificar la estructura de la route.

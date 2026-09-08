## Question

¿Cómo implementa una versión canary enviando el 10 % del tráfico a la versión nueva mediante Gateway API?

## Options

- Crear 10 réplicas de la versión antigua y 1 de la nueva
- sessionAffinity: Canary en el Service
- Dos backendRefs en HTTPRoute con pesos 90 y 10
- Utilizar dos Gateways con el mismo hostname

## Solution

**Dos backendRefs en HTTPRoute con pesos 90 y 10** es la respuesta correcta: HTTPRoute admite división nativa del tráfico mediante varios `backendRefs` con pesos. También puede enrutar el canary por header/cookie utilizando `matches.headers` en una regla separada.

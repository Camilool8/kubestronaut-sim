## Question

En un cluster SIN ninguna NetworkPolicy aplicada, ¿cuál es la postura de red predeterminada entre los pods?

## Options

- Solo se permite tráfico dentro del mismo namespace
- Solo se permite tráfico TCP
- Todo está bloqueado de forma predeterminada
- Todo está permitido entre cualquier pod (allow-any-any)

## Solution

**Todo está permitido entre cualquier pod (allow-any-any)** es la respuesta correcta: El modelo de red de Kubernetes está abierto de forma predeterminada: sin policies no existe ningún aislamiento. Por eso la práctica recomendada es comenzar con default-deny por namespace y permitir explícitamente solo lo necesario.

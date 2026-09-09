## Question

Durante un rollout, los pods nuevos entran en EndpointSlice como ready y reciben tráfico INMEDIATAMENTE, pero devuelven 502 durante unos 3 segundos. La readinessProbe está pasando. ¿Dónde está la trampa?

## Options

- La probe valida algo superficial antes de que la aplicación esté lista
- kube-proxy siempre es demasiado lento
- EndpointSlice tiene un retraso obligatorio de 3 segundos
- Los 502 son normales durante rollouts

## Solution

**La probe valida algo superficial antes de que la aplicación esté lista** es la respuesta correcta: "Pod Endpoint Availability" depende de la HONESTIDAD de la probe: una comprobación TCP pasa cuando hay un socket abierto aunque la aplicación siga fría. Los endpoints entran en el balanceo en el instante en que quedan ready; la probe es el contrato.

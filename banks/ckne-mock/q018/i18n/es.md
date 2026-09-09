## Question

Para que todas las solicitudes del mismo cliente lleguen siempre al mismo pod mediante ClusterIP, ¿qué configuración del Service utiliza?

## Options

- publishNotReadyAddresses: true
- topologyKeys
- externalTrafficPolicy: Local
- sessionAffinity: ClientIP

## Solution

**sessionAffinity: ClientIP** es la respuesta correcta: `sessionAffinity: ClientIP` mantiene afinidad por IP de origen (con `timeoutSeconds`, predeterminado 3 h). Es la única afinidad nativa L4; la afinidad basada en cookies requiere un proxy L7 (Ingress/Gateway).

## Question

¿Por qué el balanceo round-robin simple es inadecuado para el tráfico de LLM y requiere estrategias específicas?

## Options

- Las solicitudes tienen un coste extremadamente variable
- Las GPU no pueden manejar más de una conexión TCP
- Los LLM no utilizan HTTP
- kube-proxy bloquea el tráfico de IA

## Solution

**Las solicitudes tienen un coste extremadamente variable** es la respuesta correcta: Una solicitud puede generar 10 tokens y otra 4.000; las respuestas son largas y se transmiten por streaming (SSE). Los balanceadores conscientes de inferencia utilizan la presión de cola/KV-cache por réplica, afinidad de prefijo y timeouts ajustados.

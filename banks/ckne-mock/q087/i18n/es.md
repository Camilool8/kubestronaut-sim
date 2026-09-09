## Question

Los clientes llaman a una API de estilo OpenAI donde el modelo deseado llega en el BODY JSON ({"model": "llama-3"}). ¿Por qué esto es un problema para los gateways tradicionales y cuál es la solución?

## Options

- No es un problema; los gateways leen JSON de forma nativa
- Cambiar el protocolo a UDP
- Utilizar NodePort
- Los gateways enrutan por path/header/SNI, no por el body

## Solution

**Los gateways enrutan por path/header/SNI, no por el body** es la respuesta correcta: El enrutamiento clásico no inspecciona el payload. La extensión Body-Based Routing (Envoy ext-proc en Inference Gateway) analiza el JSON, convierte `model` en un header y el enrutamiento normal HTTPRoute/InferencePool decide el destino.

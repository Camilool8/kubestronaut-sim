## Question

¿Qué es el enrutamiento consciente de LoRA en los inference gateways?

## Options

- Utilizar únicamente GPU NVIDIA
- Enviar a réplicas que ya tienen cargado el adaptador LoRA
- Comprimir las respuestas
- Balancear por hash del prompt entre todas las réplicas

## Solution

**Enviar a réplicas que ya tienen cargado el adaptador LoRA** es la respuesta correcta: Servidores como vLLM exponen qué adaptadores LoRA están cargados. Endpoint Picker prioriza réplicas con el adaptador ya activo; cambiar adaptadores consume tiempo de GPU y degrada la latencia de todos los elementos de la cola.

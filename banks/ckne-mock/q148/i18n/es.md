## Question

¿Por qué el enrutamiento con afinidad de PREFIJO del prompt (consciente de prefix-cache) mejora drásticamente la latencia en servidores LLM como vLLM?

## Options

- Reduce el tamaño de la respuesta
- Comprime el modelo antes de cada solicitud
- Evita el handshake TLS entre el gateway y cada réplica
- Reutiliza la KV-cache del prefijo y evita un prefill completo

## Solution

**Reutiliza la KV-cache del prefijo y evita un prefill completo** es la respuesta correcta: Prefill es la parte costosa. Si el prefijo (por ejemplo, un system prompt largo) ya está en la KV-cache de una réplica, enviar allí la misma conversación ahorra ese coste. El balanceo "ciego" dispersa y desperdicia la caché.

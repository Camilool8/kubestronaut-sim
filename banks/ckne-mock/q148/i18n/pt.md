## Question

Por que roteamento com afinidade de PREFIXO de prompt (prefix-cache aware) melhora drasticamente a latência em servidores LLM como vLLM?

## Options

- Reduz o tamanho da resposta
- Comprime o modelo antes de cada requisição
- Evita o handshake TLS entre o gateway e cada réplica
- Reaproveita o KV-cache do prefixo, evitando refazer o prefill

## Solution

**Reaproveita o KV-cache do prefixo, evitando refazer o prefill** é a resposta correta: O prefill é a parte cara. Se o prefixo (ex.: system prompt longo) já está no KV-cache de uma réplica, mandá-la a mesma conversa economiza esse custo. Balancear "cego" espalha e desperdiça cache.

## Question

No Corefile do CoreDNS, o que a linha `cache 30` dentro do bloco de servidor faz?

## Options

- Cache de respostas por até 30 s, reduzindo carga nos upstreams
- Limita cada pod a 30 consultas
- Aumenta o TTL de todos os registros para 30 minutos
- Cria 30 réplicas do CoreDNS

## Solution

**Cache de respostas por até 30 s, reduzindo carga nos upstreams** é a resposta correta: O plugin `cache` guarda respostas (success e denial) por até o tempo indicado, respeitando TTLs menores. É um dos ajustes de maior impacto em performance de DNS do cluster, junto com réplicas adequadas do CoreDNS.

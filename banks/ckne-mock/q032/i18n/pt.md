## Question

Requisições de streaming (SSE) de um LLM atrás de um Gateway são cortadas após ~30s. Qual é o ajuste correto?

## Options

- Aumentar os timeouts de request/idle no Gateway/HTTPRoute
- Desabilitar o TLS para reduzir a latência do handshake
- Diminuir o keepalive do kernel
- Trocar o Service para UDP, que não sofre timeouts

## Solution

**Aumentar os timeouts de request/idle no Gateway/HTTPRoute** é a resposta correta: Proxies aplicam timeouts padrão (30–60s). Streaming de tokens exige elevar `timeouts.request`/`backendRequest` no HTTPRoute (GEP-1742) ou equivalente, e manter buffering desabilitado para SSE.

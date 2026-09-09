## Question

Por que balanceamento round-robin simples é ruim para tráfego de LLM, exigindo estratégias específicas?

## Options

- Requisições têm custo extremamente variável
- GPUs não suportam mais de uma conexão TCP
- LLMs não usam HTTP
- O kube-proxy bloqueia tráfego de IA

## Solution

**Requisições têm custo extremamente variável** é a resposta correta: Uma requisição pode gerar 10 tokens e outra 4.000; respostas são streaming (SSE) e longas. Balanceadores cientes de inferência usam fila/pressão de KV-cache por réplica e afinidade de prefixo, além de timeouts ajustados.

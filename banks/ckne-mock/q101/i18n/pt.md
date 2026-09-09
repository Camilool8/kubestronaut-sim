## Question

Em um cluster sem NENHUMA NetworkPolicy aplicada, qual é a postura de rede padrão entre pods?

## Options

- Apenas tráfego dentro do mesmo namespace é permitido
- Apenas tráfego TCP é permitido
- Tudo bloqueado por padrão
- Tudo permitido entre quaisquer pods (allow-any-any)

## Solution

**Tudo permitido entre quaisquer pods (allow-any-any)** é a resposta correta: O modelo de rede do Kubernetes é aberto por padrão: sem policies, não há isolamento algum. Por isso a prática recomendada é começar com default-deny por namespace e liberar explicitamente o necessário.

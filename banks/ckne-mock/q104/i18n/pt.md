## Question

Como permitir uma FAIXA de portas (ex.: 30000 a 32767) em uma única regra de NetworkPolicy?

## Options

- NetworkPolicy não suporta faixas
- Usar o protocolo RANGE
- Listar as 2768 portas uma a uma em múltiplas regras
- Usar port: 30000 com endPort: 32767 na mesma entrada

## Solution

**Usar port: 30000 com endPort: 32767 na mesma entrada** é a resposta correta: O campo `endPort` define o fim da faixa iniciada em `port` (exige port numérica, não nomeada). Disponível como stable desde o Kubernetes 1.25.

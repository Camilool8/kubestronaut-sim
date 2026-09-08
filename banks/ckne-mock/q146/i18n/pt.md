## Question

Você configurou canary por peso (90/10) E uma rule que roteia o header x-beta: true para a v2. Um usuário com x-beta: true está caindo na v1 às vezes. O que revisar?

## Options

- O navegador remove headers
- O Gateway API não suporta match de headers
- Se o match de header está na MESMA rule dos pesos
- Pesos sempre vencem headers

## Solution

**Se o match de header está na MESMA rule dos pesos** é a resposta correta: Pegadinha de estrutura: canary por header exige uma rule separada (match de header) avaliada como mais específica; a rule só com pesos fica como fallback. Misturar tudo numa rule produz sorteio ponderado para todos.

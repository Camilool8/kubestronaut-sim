## Question

Qual recurso substituiu o objeto Endpoints como mecanismo principal e escalável de rastreamento de backends de um Service?

## Options

- EndpointSlice
- PodDisruptionBudget
- BackendConfig
- ServiceEntry

## Solution

**EndpointSlice** é a resposta correta: `EndpointSlice` particiona os endpoints em fatias (até 100 por slice por padrão), reduzindo o custo de atualização em Services grandes e adicionando topologia (zona, nó). O objeto Endpoints antigo é mantido por compatibilidade.

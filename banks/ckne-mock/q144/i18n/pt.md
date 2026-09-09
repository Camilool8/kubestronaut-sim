## Question

Num HTTPRoute com dois backendRefs, um deles está com weight: 0. O que acontece com esse backend?

## Options

- Recebe metade do tráfego mesmo assim
- O route é rejeitado
- weight: 0 é inválido
- Não recebe NENHUMA requisição nova

## Solution

**Não recebe NENHUMA requisição nova** é a resposta correta: Peso zero = fração 0 do tráfego. É intencionalmente válido: mantém o backend "plugado" para virar o tráfego instantaneamente (flip 0↔100) sem editar a estrutura da rota.

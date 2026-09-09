## Question

Você precisa permitir apenas GET /public/* no serviço, bloqueando POST e outros paths, usando política de rede do CNI. O que isso exige?

## Options

- NetworkPolicy nativa com um campo httpRules para métodos HTTP
- Um firewall externo na borda do datacenter apenas
- Regras L7 (ex.: CiliumNetworkPolicy com toPorts.rules.http method/path)
- Basta endPort cobrindo o range de portas HTTP

## Solution

**Regras L7 (ex.: CiliumNetworkPolicy com toPorts.rules.http method/path)** é a resposta correta: Filtragem por método/path é L7: o Cilium injeta um proxy transparente para os fluxos cobertos pela regra. Implicação de prova: policies L7 adicionam um hop de proxy (latência) só onde aplicadas.

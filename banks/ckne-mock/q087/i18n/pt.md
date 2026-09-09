## Question

Clientes chamam uma API estilo OpenAI onde o modelo desejado vem no CORPO JSON ({"model": "llama-3"}). Por que isso é um problema para gateways tradicionais, e qual a solução?

## Options

- Não é problema; gateways leem JSON nativamente
- Trocar o protocolo para UDP
- Usar NodePort
- Gateways roteiam por path/header/SNI, não por corpo

## Solution

**Gateways roteiam por path/header/SNI, não por corpo** é a resposta correta: Roteamento clássico não inspeciona payload. A extensão de Body-Based Routing (Envoy ext-proc no Inference Gateway) faz o parse do JSON, promove `model` a header e o roteamento normal do HTTPRoute/InferencePool decide o destino.

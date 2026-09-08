## Question

Depois de concentrar todo o egress num único egressIP, conexões externas começam a falhar intermitentemente sob pico com erros de "cannot assign requested address" no gateway. Qual é o limite atingido?

## Options

- Limite de DNS
- Limite de banda do kernel no nó gateway
- Limite de pods por nó
- Esgotamento de portas de origem do SNAT

## Solution

**Esgotamento de portas de origem do SNAT** é a resposta correta: SNAT multiplexa tudo em (egressIP, porta): a tupla (proto, srcIP, srcPort, dst) precisa ser única. Sob escala, as ~64k portas acabam — port exhaustion. Sintoma típico de funil de NAT centralizado.

## Question

Uma policy de INGRESS permite tráfego para o pod na porta 8080, mas não há NENHUMA policy de egress liberando as respostas de volta. As conexões funcionam?

## Options

- Só funcionam por 30 segundos
- Não, é preciso liberar a resposta no egress
- Sim: o enforcement é stateful
- Apenas com UDP

## Solution

**Sim: o enforcement é stateful** é a resposta correta: NetworkPolicies operam sobre conexões (conntrack), não pacote a pacote: liberar o sentido de iniciação basta. Confundir com ACLs stateless leva a policies de "resposta" redundantes e enganosas.

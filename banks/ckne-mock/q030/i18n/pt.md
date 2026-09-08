## Question

Para expor as redes de pods diretamente à rede física da empresa (sem NAT), tornando os pod IPs roteáveis, qual abordagem é usada?

## Options

- Criar um NodePort por pod
- Anunciar os pod CIDRs via BGP
- Habilitar hostNetwork em todos os pods
- Aumentar o ndots no resolv.conf

## Solution

**Anunciar os pod CIDRs via BGP** é a resposta correta: CNIs com BGP estabelecem sessões com os roteadores e anunciam os podCIDRs de cada nó. A rede externa aprende as rotas e alcança pods diretamente, eliminando encapsulamento/NAT.

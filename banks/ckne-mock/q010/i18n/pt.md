## Question

Um pod com hostNetwork: true apresenta qual comportamento de rede?

## Options

- Fica sem conectividade externa
- Recebe um IP do pod CIDR normalmente
- Só se comunica com pods do mesmo namespace
- Compartilha o namespace de rede do nó e usa o IP do nó

## Solution

**Compartilha o namespace de rede do nó e usa o IP do nó** é a resposta correta: Com `hostNetwork: true`, o pod não recebe netns próprio: usa o IP e as interfaces do nó. Portas abertas competem com processos do host, e NetworkPolicies baseadas em podSelector geralmente não se aplicam como esperado.

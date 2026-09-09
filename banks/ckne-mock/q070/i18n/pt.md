## Question

Qual é o propósito do NodeLocal DNSCache?

## Options

- Bloquear consultas externas
- Rodar um cache DNS em cada nó
- Substituir o CoreDNS
- Servir apenas registros PTR

## Solution

**Rodar um cache DNS em cada nó** é a resposta correta: O NodeLocal DNSCache (DaemonSet) intercepta as consultas no próprio nó em um IP link-local (ex.: 169.254.20.10), respondendo do cache e fazendo upgrade para TCP com o CoreDNS — mitigando as clássicas corridas de conntrack com DNS/UDP.

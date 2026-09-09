## Question

Qual é a principal limitação do modo L2 (ARP) de anúncio de LoadBalancer (MetalLB L2 / Cilium L2 Announcements)?

## Options

- Exige licença comercial do MetalLB Enterprise
- Todo o tráfego de um VIP entra por UM único nó eleito
- Não suporta TCP, somente UDP
- Não funciona com IPv4, apenas IPv6 dual-stack

## Solution

**Todo o tráfego de um VIP entra por UM único nó eleito** é a resposta correta: No L2, um único nó responde ARP pelo VIP: a banda de entrada limita-se a esse nó e o failover depende de gratuitous ARP (segundos de indisponibilidade). BGP+ECMP resolve ambos — por isso é o modo preferido em produção.

## Question

Aplicações reportam timeouts de DNS de EXATOS 5 segundos, intermitentes, sob carga. Qual é a causa clássica e a mitigação?

## Options

- Cabo de rede ruim em um dos nós
- O CoreDNS é lento sob qualquer carga
- TTL zero nos registros retornados pelo upstream
- Race condition de conntrack com consultas UDP paralelas

## Solution

**Race condition de conntrack com consultas UDP paralelas** é a resposta correta: Os "5 segundos malditos": drops por corrida de inserção no conntrack com UDP. O NodeLocal DNSCache elimina o NAT do caminho (e faz upstream via TCP) — a correção estrutural mais recomendada.

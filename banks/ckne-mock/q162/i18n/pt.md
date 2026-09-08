## Question

O painel mostra explosão de NXDOMAIN no CoreDNS e o time suspeita de ataque. As consultas são todas do tipo api.stripe.com.default.svc.cluster.local. Qual é o diagnóstico correto?

## Options

- Falta memória no CoreDNS
- O CoreDNS foi comprometido
- Ataque de DNS tunneling
- Comportamento normal do ndots:5

## Solution

**Comportamento normal do ndots:5** é a resposta correta: Antes de gritar "ataque", olhe o SUFIXO das consultas falhas: se são nomes externos + search domains, é o ndots. Métricas de NXDOMAIN precisam desse contexto para não gerar alertas falsos.

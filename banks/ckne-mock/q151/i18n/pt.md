## Question

Dois clusters com pod CIDRs IDÊNTICOS (ambos 10.244.0.0/16) precisam se conectar via Submariner. É possível?

## Options

- Só se um cluster for IPv6
- Não, CIDRs sobrepostos impedem qualquer conexão
- Sim, com Globalnet: CIDRs virtuais + NAT cross-cluster
- Sim, sem nenhuma configuração

## Solution

**Sim, com Globalnet: CIDRs virtuais + NAT cross-cluster** é a resposta correta: Overlap de CIDRs impede roteamento direto (mesma rede dos dois lados). O Submariner Globalnet cria globalCIDRs virtuais + NAT de ingresso/egresso — solução específica para brownfields com ranges repetidos.

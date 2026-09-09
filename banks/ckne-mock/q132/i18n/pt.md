## Question

O CNI usa MTU 1450 nas interfaces dos pods, e a rede física suporta jumbo frames (9000). Qual configuração extrai o máximo desempenho com VXLAN?

## Options

- Desativar o VXLAN
- MTU 65535 nos pods
- Subir a MTU física para 9000 e configurar os pods com 8950
- Manter 1450 — é obrigatório com qualquer VXLAN

## Solution

**Subir a MTU física para 9000 e configurar os pods com 8950** é a resposta correta: O limite dos pods é sempre MTU física − overhead (~50 do VXLAN). Com jumbo frames fim-a-fim, 8950 nos pods multiplica o throughput de workloads de dados. O erro comum é subir só um dos lados.

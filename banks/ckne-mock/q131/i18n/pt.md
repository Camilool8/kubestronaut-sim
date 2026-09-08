## Question

Conexões TCP entre nós via VXLAN falham de forma bizarra (handshake ok, dados corrompidos/travados). Um workaround conhecido é `ethtool -K flannel.1 tx-checksum-ip-generic off`. Qual é o problema subjacente?

## Options

- O kernel não suporta TCP sobre VXLAN
- Falta de memória
- MTU alta demais em todas as interfaces físicas
- Checksum offload do driver calculado errado com VXLAN

## Solution

**Checksum offload do driver calculado errado com VXLAN** é a resposta correta: Clássico de produção: offload de checksum na interface VXLAN gera checksums inválidos em certas combinações kernel/driver. Desligar o offload na vtep resolve — e explica por que "ping passa, aplicação trava".

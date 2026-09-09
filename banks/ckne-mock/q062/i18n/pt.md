## Question

Ao usar VXLAN com interfaces de nó com MTU 1500, qual configuração evita fragmentação/perda de pacotes grandes?

## Options

- MTU do CNI descontando o overhead do túnel (ex.: 1450)
- Reduzir o número de réplicas
- Aumentar a MTU dos pods para 9000
- Desabilitar o TCP e usar apenas UDP nos pods

## Solution

**MTU do CNI descontando o overhead do túnel (ex.: 1450)** é a resposta correta: O cabeçalho VXLAN consome ~50 bytes; se o pod envia frames de 1500, o pacote encapsulado excede a MTU física e é descartado. Configure a MTU do CNI (campo `mtu`/auto-detecção) para 1450 ou habilite jumbo frames (9000) na rede física.

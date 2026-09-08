## Question

Ao usar Multus com redes secundárias em vários nós, por que o IPAM whereabouts é preferível ao host-local?

## Options

- Porque o host-local exige DHCP externo
- host-local aloca por nó sem coordenação e pode duplicar IPs
- Porque é mais rápido em todas as operações de ADD e DEL do CNI
- Porque o whereabouts suporta apenas IPv6

## Solution

**host-local aloca por nó sem coordenação e pode duplicar IPs** é a resposta correta: O `host-local` guarda estado apenas no disco do nó — dois nós podem entregar o mesmo IP na rede secundária. O `whereabouts` registra alocações em CRDs no cluster, garantindo unicidade do range inteiro entre todos os nós.

## Question

Ao deletar um pod, qual operação CNI é chamada — e o que acontece se o nó reiniciar ANTES dela executar?

## Options

- CNI DEL; sem ela, leases de IP ficam órfãos no IPAM
- CNI FLUSH; o etcd remove o IP
- Nenhuma; o kernel sempre limpa tudo sozinho
- CNI REMOVE; nada acontece

## Solution

**CNI DEL; sem ela, leases de IP ficam órfãos no IPAM** é a resposta correta: O runtime chama `CNI_COMMAND=DEL` na remoção. Crashes podem pular essa etapa — origem dos leases fantasmas em `/var/lib/cni/networks` e do erro "no IP addresses available" semanas depois.

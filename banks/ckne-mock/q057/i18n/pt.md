## Question

Pods ficam presos em ContainerCreating com o erro "failed to allocate for range 0: no IP addresses available in range". Qual é o diagnóstico e a correção?

## Options

- O DNS do cluster caiu
- O pool de IPAM do nó esgotou
- Falta memória no kubelet
- O apiserver está limitando requisições

## Solution

**O pool de IPAM do nó esgotou** é a resposta correta: Cada nó tem um range finito (podCIDR /24 padrão ≈ 254 IPs vs. max-pods 110). Crashes podem deixar leases órfãos no state do IPAM (ex.: `/var/lib/cni/networks/<rede>`). Limpe arquivos de IPs sem container correspondente ou redimensione o range.

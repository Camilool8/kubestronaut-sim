## Question

Para criptografar de forma transparente todo o tráfego pod-a-pod entre nós, sem alterar as aplicações, qual recurso do CNI você habilita?

## Options

- kube-proxy em modo IPVS
- NetworkPolicy com campo encrypt: true
- Criptografia WireGuard ou IPsec no CNI
- TLS no CoreDNS

## Solution

**Criptografia WireGuard ou IPsec no CNI** é a resposta correta: Cilium e Calico oferecem criptografia transparente node-to-node: WireGuard (chaves automáticas por nó) ou IPsec (rotação via secret). Cobre o tráfego no fio entre nós — complementar ao mTLS de aplicação.

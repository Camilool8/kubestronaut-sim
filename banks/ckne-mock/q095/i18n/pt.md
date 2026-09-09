## Question

Ao anunciar o mesmo VIP de LoadBalancer via BGP a partir de vários nós, qual mecanismo dos roteadores distribui o tráfego entre eles?

## Options

- ECMP (Equal-Cost Multi-Path)
- NAT reverso no roteador de borda
- DNS round-robin com TTL baixo
- STP (Spanning Tree Protocol) entre os switches

## Solution

**ECMP (Equal-Cost Multi-Path)** é a resposta correta: Com ECMP, cada fluxo (hash 5-tuplas) é enviado a um dos nós anunciantes — balanceamento real na camada de rede, com convergência rápida quando um nó para de anunciar (BFD acelera a detecção).

## Question

Al anunciar el mismo VIP LoadBalancer mediante BGP desde varios nodos, ¿qué mecanismo del router distribuye el tráfico entre ellos?

## Options

- ECMP (Equal-Cost Multi-Path)
- NAT inverso en el router perimetral
- DNS round-robin con TTL bajo
- STP (Spanning Tree Protocol) entre los switches

## Solution

**ECMP (Equal-Cost Multi-Path)** es la respuesta correcta: Con ECMP, cada flujo (hash de 5-tupla) se envía a uno de los nodos anunciantes: balanceo real en la capa de red, con convergencia rápida cuando un nodo deja de anunciar. BFD acelera la detección.

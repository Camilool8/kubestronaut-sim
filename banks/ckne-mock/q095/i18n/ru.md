## Question

Какой механизм маршрутизатора распределяет трафик между несколькими узлами, объявляющими один LoadBalancer VIP через BGP?

## Options

- ECMP (Equal-Cost Multi-Path)
- Reverse NAT на edge router
- DNS round-robin с низким TTL
- STP (Spanning Tree Protocol) между switches

## Solution

**ECMP (Equal-Cost Multi-Path)** — правильный ответ: При ECMP каждый flow на основе hash 5-tuple отправляется на один из объявляющих узлов. Это настоящая балансировка на сетевом уровне с быстрой convergence, когда узел прекращает анонс; BFD ускоряет обнаружение.

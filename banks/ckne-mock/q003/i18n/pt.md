## Question

Você precisa capturar o tráfego de um pod específico direto no nó, sem entrar no pod. Qual é a abordagem correta?

## Options

- tcpdump -i eth0 no nó, pois todo tráfego de pods passa por eth0 sem alteração
- Não é possível; tcpdump só funciona dentro do pod
- Identificar a interface veth do pod no host e rodar tcpdump -i vethXXXX
- Rodar tcpdump -i lo, pois pods usam loopback do host

## Solution

**Identificar a interface veth do pod no host e rodar tcpdump -i vethXXXX** é a resposta correta: Cada pod tem um par veth: uma ponta dentro do netns do pod (eth0) e outra no host (vethXXXX). Descubra o par comparando índices de interface e capture com `tcpdump -i vethXXXX`. Alternativa: `nsenter -t <PID> -n tcpdump`.

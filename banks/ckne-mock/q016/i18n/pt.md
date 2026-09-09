## Question

Um pod está Running, mas não recebe tráfego do Service. O `kubectl get endpointslices` mostra o endpoint com ready: false. Qual a causa mais provável?

## Options

- O CoreDNS está caindo
- kube-proxy só funciona com pods ready: true no manifesto
- A readinessProbe do pod está falhando, removendo-o do balanceamento
- O ClusterIP expirou

## Solution

**A readinessProbe do pod está falhando, removendo-o do balanceamento** é a resposta correta: A `readinessProbe` controla a disponibilidade do endpoint: enquanto falhar, o pod fica not-ready no EndpointSlice e não recebe tráfego. É o mecanismo central de "Pod Endpoint Availability". Veja eventos com `kubectl describe pod`.

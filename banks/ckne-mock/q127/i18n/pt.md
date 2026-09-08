## Question

Qual é a diferença real entre hostPort (no pod) e um Service NodePort?

## Options

- São idênticos
- NodePort só funciona em cloud
- hostPort é mais seguro e balanceia melhor
- hostPort abre a porta APENAS no nó onde o pod está

## Solution

**hostPort abre a porta APENAS no nó onde o pod está** é a resposta correta: `hostPort` amarra pod↔nó (colisão de portas limita agendamento); NodePort é implementado pelo kube-proxy em todos os nós. Confundi-los causa "funciona num nó, falha nos outros".

## Question

Qual é o intervalo padrão de portas alocadas para Services do tipo NodePort?

## Options

- 8000–9000
- 30000–32767
- 1024–2048
- 49152–65535

## Solution

**30000–32767** é a resposta correta: O padrão é `30000–32767`, configurável no kube-apiserver com `--service-node-port-range`. Cada NodePort é aberto em todos os nós, encaminhando para os endpoints do Service.

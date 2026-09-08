## Question

Qual registro DNS o Kubernetes cria para um POD individual (sem Service), e qual é o formato?

## Options

- pod-name.cluster.local
- O IP com traços: 10-244-1-5.default.pod.cluster.local
- pods.default.svc
- Nenhum registro jamais é criado para pods

## Solution

**O IP com traços: 10-244-1-5.default.pod.cluster.local** é a resposta correta: Existe o formato `a-b-c-d.ns.pod.cluster.local`, mas ele embute o próprio IP — não serve para descobrir pods. Descoberta estável de pods = headless Service (StatefulSet).

## Question

Em um Service, qual é a diferença entre port, targetPort e nodePort?

## Options

- São sinônimos
- port é a porta do próprio Service
- Apenas nodePort é obrigatório
- port é do container, targetPort é do nó, nodePort é do Service

## Solution

**port é a porta do próprio Service** é a resposta correta: O cliente acessa `ClusterIP:port`; o kube-proxy faz DNAT para `podIP:targetPort`; se o tipo expõe nós, `nodePort` é a porta externa em cada nó. Confundir port com targetPort é causa comum de "connection refused".

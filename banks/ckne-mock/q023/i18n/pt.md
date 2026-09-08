## Question

Em um Service LoadBalancer/NodePort, o que externalTrafficPolicy: Local faz?

## Options

- Encaminha só a endpoints locais do nó, preservando o IP do cliente
- Restringe o acesso a clientes da mesma sub-rede
- Força o uso do modo IPVS
- Desabilita o balanceamento e envia tudo ao primeiro endpoint

## Solution

**Encaminha só a endpoints locais do nó, preservando o IP do cliente** é a resposta correta: Com `Local`, o nó só encaminha para pods locais — sem SNAT, o IP real do cliente é preservado. Nós sem endpoints saem do LB via healthCheckNodePort. Com `Cluster` (padrão), há possível segundo salto com SNAT.

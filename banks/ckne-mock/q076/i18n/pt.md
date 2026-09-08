## Question

Além dos registros A, qual tipo de registro DNS o Kubernetes cria para portas nomeadas de um Service, e com qual formato?

## Options

- Registros TXT com o YAML do Service
- SRV no formato _porta._proto.servico.ns.svc.cluster.local
- Registros MX para cada porta nomeada do Service
- Registros NS por namespace

## Solution

**SRV no formato _porta._proto.servico.ns.svc.cluster.local** é a resposta correta: Para cada porta nomeada, é criado um SRV `_http._tcp.meu-svc.default.svc.cluster.local` retornando porta e host. Aplicações podem descobrir a porta dinamicamente via SRV, sem hardcode.

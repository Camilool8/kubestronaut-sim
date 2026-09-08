## Question

Como fazer um Service do cluster balancear para um backend EXTERNO com IPs fixos (ex.: banco legado 192.168.10.5:5432), mantendo um nome DNS interno?

## Options

- Service sem selector + EndpointSlice manual com os IPs externos
- Instalar o banco dentro do cluster como StatefulSet
- Isso é impossível sem reescrever o kube-proxy
- Usar hostNetwork

## Solution

**Service sem selector + EndpointSlice manual com os IPs externos** é a resposta correta: Um Service sem `selector` não gera endpoints automáticos; você cria o `EndpointSlice` (com label kubernetes.io/service-name) manualmente com os IPs externos. Diferente do ExternalName (CNAME), aqui há VIP e balanceamento reais.

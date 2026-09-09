## Question

No Istio, qual recurso registra um serviço EXTERNO (ex.: api.stripe.com) no service registry do mesh, permitindo aplicar rotas, TLS e políticas ao tráfego de egress?

## Options

- ServiceEntry
- EgressClass
- OutboundPolicy
- ExternalName

## Solution

**ServiceEntry** é a resposta correta: O `ServiceEntry` adiciona hosts externos ao registry do Istio. Combinado com VirtualService/DestinationRule e um egress gateway, permite controlar, monitorar e criptografar o tráfego que sai do mesh — inclusive com REGISTRY_ONLY bloqueando destinos não declarados.

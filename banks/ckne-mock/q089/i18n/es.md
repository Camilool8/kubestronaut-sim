## Question

En Istio, ¿qué recurso registra un servicio EXTERNO (por ejemplo, api.stripe.com) en el service registry del mesh, permitiendo routes, TLS y policies sobre el tráfico de egress?

## Options

- ServiceEntry
- EgressClass
- OutboundPolicy
- ExternalName

## Solution

**ServiceEntry** es la respuesta correcta: `ServiceEntry` añade hosts externos al registro de Istio. Combinado con VirtualService/DestinationRule y un egress gateway, permite controlar, monitorizar y cifrar el tráfico que sale del mesh, incluido REGISTRY_ONLY para bloquear destinos no declarados.

## Question

Quelle ressource Istio enregistre un service EXTERNE (ex. api.stripe.com) dans le registre du mesh, permettant routes, TLS et policies sur l'egress ?

## Options

- ServiceEntry
- EgressClass
- OutboundPolicy
- ExternalName

## Solution

**ServiceEntry** est la bonne réponse : `ServiceEntry` ajoute des hôtes externes au registre d'Istio. Combiné à VirtualService/DestinationRule et à un egress gateway, on contrôle, surveille et chiffre le trafic sortant du mesh — y compris REGISTRY_ONLY qui bloque les destinations non déclarées.

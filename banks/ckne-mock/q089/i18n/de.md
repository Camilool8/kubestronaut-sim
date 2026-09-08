## Question

Welche Istio-Ressource registriert einen EXTERNEN Dienst (z. B. api.stripe.com) im Mesh-Service-Registry, um Routen, TLS und Policies auf Egress anzuwenden?

## Options

- ServiceEntry
- EgressClass
- OutboundPolicy
- ExternalName

## Solution

**ServiceEntry** ist die richtige Antwort: `ServiceEntry` fügt externe Hosts dem Istio-Registry hinzu. Kombiniert mit VirtualService/DestinationRule und einem Egress-Gateway lässt sich Mesh-verlassender Traffic steuern, überwachen und verschlüsseln — inkl. REGISTRY_ONLY, das Undeklariertes blockiert.

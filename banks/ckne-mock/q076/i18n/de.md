## Question

Welchen DNS-Record-Typ erzeugt Kubernetes zusätzlich zu A-Records für benannte Service-Ports, und in welchem Format?

## Options

- TXT-Records mit dem Service-YAML
- SRV im Format _port._proto.service.ns.svc.cluster.local
- MX-Records für jeden benannten Port des Service
- NS-Records pro Namespace

## Solution

**SRV im Format _port._proto.service.ns.svc.cluster.local** ist die richtige Antwort: Für jeden benannten Port entsteht ein SRV `_http._tcp.my-svc.default.svc.cluster.local` mit Port und Host. Anwendungen können den Port dynamisch per SRV entdecken, ohne Hardcoding.

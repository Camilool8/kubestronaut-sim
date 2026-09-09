## Question

Was tut ein ExternalName-Service?

## Options

- Erzeugt einen NodePort mit eigenem Namen
- Erfordert einen in der Cloud provisionierten LoadBalancer
- Liefert einen CNAME auf einen externen DNS-Namen — ohne Proxy, ohne Endpoints
- Weist dem Pod eine feste externe IP zu

## Solution

**Liefert einen CNAME auf einen externen DNS-Namen — ohne Proxy, ohne Endpoints** ist die richtige Antwort: `ExternalName` ist reines DNS: Queries liefern einen CNAME auf `spec.externalName`. Kein VIP, kein kube-proxy, kein Balancing — nützlich, um externe Dienste hinter internen Namen zu abstrahieren.

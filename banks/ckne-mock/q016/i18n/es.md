## Question

Un pod está Running, pero no recibe tráfico del Service. `kubectl get endpointslices` muestra el endpoint con ready: false. ¿Cuál es la causa más probable?

## Options

- CoreDNS se reinicia continuamente
- kube-proxy solo funciona con pods declarados ready: true en el manifiesto
- La readinessProbe del pod está fallando y lo elimina del balanceo
- El ClusterIP caducó

## Solution

**La readinessProbe del pod está fallando y lo elimina del balanceo** es la respuesta correcta: La `readinessProbe` controla la disponibilidad del endpoint: mientras falle, el pod permanece not-ready en el EndpointSlice y no recibe tráfico. Este es el mecanismo central de "Pod Endpoint Availability". Revise los eventos con `kubectl describe pod`.

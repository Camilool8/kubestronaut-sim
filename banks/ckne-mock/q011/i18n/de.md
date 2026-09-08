## Question

Welcher Service-Typ bietet einen cluster-internen VIP mit L4-Balancing (TCP/UDP/SCTP), ohne externe Exposition?

## Options

- NodePort
- ClusterIP
- ExternalName
- LoadBalancer

## Solution

**ClusterIP** ist die richtige Antwort: `ClusterIP` ist der Standard: stabile virtuelle IP, intern per DNS auflösbar, L4-Balancing auf die Endpoints. NodePort öffnet einen Port auf jedem Node; LoadBalancer provisioniert einen externen LB; ExternalName ist nur ein CNAME.

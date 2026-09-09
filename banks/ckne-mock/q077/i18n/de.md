## Question

Wie balanciert ein Cluster-Service auf ein EXTERNES Backend mit festen IPs (z. B. Legacy-Datenbank 192.168.10.5:5432), mit internem DNS-Namen?

## Options

- Service ohne Selector + manuelles EndpointSlice mit den externen IPs
- Die Datenbank als StatefulSet in den Cluster holen
- Unmöglich, ohne kube-proxy neu zu schreiben
- hostNetwork verwenden

## Solution

**Service ohne Selector + manuelles EndpointSlice mit den externen IPs** ist die richtige Antwort: Ein Service ohne `selector` erzeugt keine automatischen Endpoints; das `EndpointSlice` (mit Label kubernetes.io/service-name) legt man manuell mit den externen IPs an. Anders als ExternalName (CNAME) gibt es hier echten VIP und Balancing.

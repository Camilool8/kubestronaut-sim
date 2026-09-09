## Question

¿Cómo hace que un Service del cluster balancee hacia un backend EXTERNO con IP fijas (por ejemplo, una base de datos heredada 192.168.10.5:5432), manteniendo un nombre DNS interno?

## Options

- Un Service sin selector + un EndpointSlice manual con las IP externas
- Instalar la base de datos dentro del cluster como StatefulSet
- Es imposible sin reescribir kube-proxy
- Utilizar hostNetwork

## Solution

**Un Service sin selector + un EndpointSlice manual con las IP externas** es la respuesta correcta: Un Service sin `selector` no genera endpoints automáticos; se crea manualmente el `EndpointSlice` (con la label kubernetes.io/service-name) usando las IP externas. A diferencia de ExternalName (CNAME), aquí se obtiene un VIP real y balanceo.

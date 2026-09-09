## Question

¿Qué devuelve DNS al consultar un Service headless (clusterIP: None) con un selector?

## Options

- Un registro CNAME hacia kube-apiserver
- El ClusterIP del Service
- Siempre NXDOMAIN
- Registros A/AAAA con las IP de cada pod ready que coincide con el selector

## Solution

**Registros A/AAAA con las IP de cada pod ready que coincide con el selector** es la respuesta correcta: Los Services headless no tienen VIP: CoreDNS responde con las IP de los pods. En StatefulSets, cada pod también obtiene un registro estable `pod.service.ns.svc.cluster.local`, esencial para bases de datos y descubrimiento basado en identidad.
